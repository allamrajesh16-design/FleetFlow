from datetime import datetime, timedelta
from decimal import Decimal
from django.db import transaction
from django.db.models import OuterRef, Subquery, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from django.conf import settings
from accounts.models import User
from accounts.emails import send_driver_assignment_email
from bookings.models import Booking, BusSchedule
from documents.models import Document
from drivers.models import Driver
from notifications.models import Notification, notify
from vehicles.models import Vehicle, Maintenance

from .assignment_rules import (
    trip_time_window,
    is_vehicle_free,
    is_driver_free,
    get_recommended_assignment,
)
from .filters import TripFilter
from .models import Trip, TripLocation, TripAssignmentLog
from .permissions import TripPermission
from .services import (
    resolve_trip_route,
    resolve_trip_route_async,
    compute_route_progress,
    compute_trip_eta_minutes,
)
from .serializers import (
    DriverTripSummarySerializer,
    TripAssignSerializer,
    TripReassignSerializer,
    TripAssignmentLogSerializer,
    TripCompleteSerializer,
    TripLocationSerializer,
    TripLocationUpdateSerializer,
    TripPlacesUpdateSerializer,
    TripSerializer,
    TripStartSerializer,
    TripSummarySerializer,
)


def get_trip_assignment_stats():
    now_dt = timezone.now()
    today_d = timezone.localdate()
    waiting_bkg = Booking.objects.filter(status=Booking.Status.APPROVED, trips__isnull=True, travel_datetime__gte=now_dt).count()
    waiting_bus = BusSchedule.objects.filter(status=BusSchedule.Status.CONFIRMED, trips__isnull=True, departure_datetime__gte=now_dt).count()
    sched_today = Trip.objects.filter(scheduled_datetime__date=today_d).count()

    curr_trips = Trip.objects.filter(status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS], scheduled_datetime__lte=now_dt)
    curr_veh_ids = set(curr_trips.values_list("vehicle_id", flat=True))
    curr_drv_ids = set(curr_trips.values_list("driver_id", flat=True))

    maint_veh_ids = set(Maintenance.objects.filter(status__in=[Maintenance.Status.SCHEDULED, Maintenance.Status.IN_PROGRESS], scheduled_date__lte=today_d).values_list("vehicle_id", flat=True))

    free_veh_count = Vehicle.objects.filter(status=Vehicle.Status.ACTIVE).exclude(id__in=curr_veh_ids | maint_veh_ids).count()
    free_drv_count = Driver.objects.filter(status=Driver.Status.ACTIVE, license_expiry__gte=today_d).exclude(id__in=curr_drv_ids).count()

    return {
        "waiting": waiting_bkg + waiting_bus,
        "scheduled_today": sched_today,
        "free_vehicles_now": free_veh_count,
        "free_drivers_now": free_drv_count,
    }


@extend_schema_view(
    list=extend_schema(
        tags=["Trips"],
        summary="List trips",
        description="List trips. Admin and Fleet Managers see all. Drivers see only their assigned trips.",
    ),
    retrieve=extend_schema(
        tags=["Trips"],
        summary="Retrieve trip details",
        description="Get full details of a specific trip.",
    ),
)
class TripViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for querying and executing trips."""

    queryset = Trip.objects.all()
    serializer_class = TripSerializer
    permission_classes = [TripPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = TripFilter
    search_fields = [
        "source",
        "destination",
        "driver__user__full_name",
        "vehicle__registration_number",
    ]
    ordering_fields = ["created_at", "scheduled_datetime", "started_at", "completed_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Trip.objects.none()

        if user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or user.is_superuser:
            return (
                Trip.objects.all()
                .select_related("vehicle", "driver", "driver__user", "booking", "booking__customer", "bus_schedule", "assigned_by")
                .prefetch_related("locations")
            )

        if user.role == User.Role.DRIVER:
            if getattr(self, "action", None) in ["start", "location", "complete"]:
                return Trip.objects.all().select_related("vehicle", "driver", "driver__user")
            return (
                Trip.objects.filter(driver__user=user)
                .select_related("vehicle", "driver", "driver__user", "booking", "booking__customer", "bus_schedule", "assigned_by")
                .prefetch_related("locations")
            )

        return Trip.objects.none()

    @extend_schema(
        tags=["Trips"],
        summary="List assignable vehicles and drivers",
        description="Returns booking summary and available vehicles and drivers for a booking or bus schedule.",
        parameters=[
            OpenApiParameter(name="booking", description="Booking ID", required=False, type=int),
            OpenApiParameter(name="bus_schedule", description="Bus Schedule ID", required=False, type=int),
            OpenApiParameter(name="include_unavailable", description="Include unavailable vehicles/drivers with reason", required=False, type=bool),
        ],
    )
    @action(detail=False, methods=["get"], url_path="assignable")
    def assignable(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can query assignable resources."},
                status=status.HTTP_403_FORBIDDEN,
            )

        booking_id = request.query_params.get("booking")
        bus_schedule_id = request.query_params.get("bus_schedule")
        include_unavailable = request.query_params.get("include_unavailable", "false").lower() in ["true", "1"]

        booking = None
        bus_schedule = None

        if booking_id:
            try:
                booking = Booking.objects.select_related("customer", "vehicle").get(pk=booking_id)
            except Booking.DoesNotExist:
                return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
            if booking.status != Booking.Status.APPROVED:
                return Response({"detail": f"Booking is not approved (status: {booking.status})."}, status=status.HTTP_400_BAD_REQUEST)
            scheduled_datetime = booking.travel_datetime
            distance_km = booking.estimated_distance_km or getattr(booking, "distance_km", None)
            target_summary = {
                "id": booking.id,
                "type": "BOOKING",
                "customer_name": booking.customer.full_name if booking.customer else "Customer",
                "customer_phone": booking.customer.phone if (booking.customer and booking.customer.phone) else "",
                "vehicle_type": booking.vehicle_type,
                "source": booking.pickup_location,
                "destination": booking.drop_location,
                "scheduled_datetime": booking.travel_datetime.isoformat() if booking.travel_datetime else None,
                "passengers": booking.passengers,
                "estimated_fare": str(booking.estimated_fare) if booking.estimated_fare is not None else None,
                "distance_km": float(distance_km) if distance_km is not None else None,
                "customer_selected_vehicle": bool(booking.vehicle_id),
                "selected_vehicle_id": booking.vehicle_id,
                "selected_vehicle_reg": booking.vehicle.registration_number if booking.vehicle else None,
                "vehicle_locked": bool(booking.vehicle_id),
                "trip_type": getattr(booking, "trip_type", "ONE_WAY"),
                "luggage_type": getattr(booking, "luggage_type", "NONE"),
                "special_instructions": getattr(booking, "special_instructions", ""),
                "pickup_details": getattr(booking, "pickup_details", {}),
                "drop_details": getattr(booking, "drop_details", {}),
            }
        elif bus_schedule_id:
            try:
                bus_schedule = BusSchedule.objects.select_related("vehicle").get(pk=bus_schedule_id)
            except BusSchedule.DoesNotExist:
                return Response({"detail": "Bus schedule not found."}, status=status.HTTP_404_NOT_FOUND)
            if bus_schedule.status != BusSchedule.Status.CONFIRMED:
                return Response({"detail": f"Bus schedule is not confirmed (status: {bus_schedule.status})."}, status=status.HTTP_400_BAD_REQUEST)
            scheduled_datetime = bus_schedule.departure_datetime
            distance_km = None
            target_summary = {
                "id": bus_schedule.id,
                "type": "BUS_SCHEDULE",
                "customer_name": "Bus Passengers",
                "vehicle_type": "BUS",
                "source": bus_schedule.source,
                "destination": bus_schedule.destination,
                "scheduled_datetime": bus_schedule.departure_datetime.isoformat() if bus_schedule.departure_datetime else None,
                "passengers": bus_schedule.vehicle.seating_capacity if bus_schedule.vehicle else 40,
                "estimated_fare": str(bus_schedule.fare_per_seat) if bus_schedule.fare_per_seat is not None else None,
                "distance_km": None,
            }
        if not booking_id and not bus_schedule_id:
            if request.query_params.get("stats") in ["true", "1"]:
                stats_data = get_trip_assignment_stats()
                return Response({
                    "stats": stats_data,
                    "vehicles": [],
                    "drivers": [],
                })
            return Response(
                {"detail": "Either booking or bus_schedule query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        is_date_passed = scheduled_datetime < now
        target_summary["date_passed"] = is_date_passed
        target_summary["can_assign"] = not is_date_passed

        start_dt, end_dt = trip_time_window(scheduled_datetime, distance_km)

        # Preload active maintenances (eliminates N+1)
        maint_vehicle_ids = set(
            Maintenance.objects.filter(
                status__in=[Maintenance.Status.SCHEDULED, Maintenance.Status.IN_PROGRESS],
                scheduled_date__lte=end_dt.date(),
            ).values_list("vehicle_id", flat=True)
        )

        # Preload expired approved compliance docs (eliminates N+1)
        expired_doc_vehicle_ids = set()
        if getattr(settings, "BLOCK_TRIPS_ON_EXPIRED_DOCUMENTS", True):
            expired_doc_vehicle_ids = set(
                Document.objects.filter(
                    vehicle__isnull=False,
                    review_status=Document.ReviewStatus.APPROVED,
                    doc_type__in=[Document.DocType.INSURANCE, Document.DocType.REGISTRATION_RC],
                    expiry_date__lt=timezone.localdate(),
                ).values_list("vehicle_id", flat=True)
            )

        # Preload overlapping SCHEDULED and IN_PROGRESS trips (eliminates N+1)
        active_trips = list(
            Trip.objects.filter(
                status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS]
            ).select_related("booking")
        )
        vehicle_trips = {}
        driver_trips = {}
        for t in active_trips:
            if t.vehicle_id:
                vehicle_trips.setdefault(t.vehicle_id, []).append(t)
            if t.driver_id:
                driver_trips.setdefault(t.driver_id, []).append(t)

        # Preload latest trip per driver (eliminates N+1)
        recent_trips = list(
            Trip.objects.all().order_by("-scheduled_datetime")[:300].values("id", "driver_id", "status")
        )
        driver_last_trip = {}
        for rt in recent_trips:
            did = rt.get("driver_id")
            if did and did not in driver_last_trip:
                driver_last_trip[did] = f"Trip #{rt['id']} ({rt['status']})"

        # Preload next scheduled maintenance per vehicle
        future_maints = Maintenance.objects.filter(
            status=Maintenance.Status.SCHEDULED,
            scheduled_date__gte=timezone.localdate(),
        ).order_by("scheduled_date")
        next_maint_map = {}
        for m in future_maints:
            if m.vehicle_id not in next_maint_map:
                next_maint_map[m.vehicle_id] = m.scheduled_date.isoformat()

        # Preload today's workload per driver
        trip_date = start_dt.date()
        driver_trips_today = {}
        vehicle_trips_today = {}
        for t in Trip.objects.filter(scheduled_datetime__date=trip_date).select_related("booking"):
            did = t.driver_id
            vid = t.vehicle_id
            if vid:
                vehicle_trips_today[vid] = vehicle_trips_today.get(vid, 0) + 1
            if did:
                bkg = t.booking
                dist = (getattr(bkg, "estimated_distance_km", None) or getattr(bkg, "distance_km", None)) if bkg else None
                w_start, w_end = trip_time_window(t.scheduled_datetime, dist)
                duration_hrs = (w_end - w_start).total_seconds() / 3600.0
                if did not in driver_trips_today:
                    driver_trips_today[did] = {"count": 0, "hours": 0.0}
                driver_trips_today[did]["count"] += 1
                driver_trips_today[did]["hours"] += duration_hrs

        # Evaluate Vehicles
        all_vehicles = Vehicle.objects.all().order_by("registration_number")
        vehicles_result = []
        for v in all_vehicles:
            is_free, reason = is_vehicle_free(
                v,
                start_dt,
                end_dt,
                booking=booking,
                bus_schedule=bus_schedule,
                maintenance_vehicle_ids=maint_vehicle_ids,
                expired_doc_vehicle_ids=expired_doc_vehicle_ids,
                vehicle_trips=vehicle_trips,
            )
            if is_free or include_unavailable:
                # Calculate next free time in memory
                next_free = None
                v_active = vehicle_trips.get(v.id, [])
                if v_active:
                    latest_trip = max(v_active, key=lambda x: x.scheduled_datetime)
                    bkg = latest_trip.booking
                    lt_dist = (getattr(bkg, "estimated_distance_km", None) or getattr(bkg, "distance_km", None)) if bkg else None
                    _, lt_end = trip_time_window(latest_trip.scheduled_datetime, lt_dist)
                    next_free = lt_end.strftime("%I:%M %p")

                is_locked_choice = False
                customer_selected = False
                if booking and booking.vehicle_id:
                    if v.id == booking.vehicle_id:
                        is_locked_choice = True
                        customer_selected = True
                    else:
                        if is_free:
                            is_free = False
                            reason = f"Customer specifically selected vehicle {booking.vehicle.registration_number}."

                vehicles_result.append({
                    "id": v.id,
                    "registration_number": v.registration_number,
                    "brand": v.brand,
                    "model": v.model,
                    "vehicle_type": v.vehicle_type,
                    "seating_capacity": v.seating_capacity,
                    "rate_per_km": str(v.rate_per_km) if getattr(v, "rate_per_km", None) else None,
                    "fuel_type": "Petrol" if v.vehicle_type == "BIKE" else "Diesel",
                    "next_service_date": next_maint_map.get(v.id),
                    "available": is_free,
                    "reason": reason,
                    "next_free_time": next_free,
                    "customer_selected": customer_selected,
                    "is_locked_choice": is_locked_choice,
                })

        # Evaluate Drivers
        all_drivers = Driver.objects.all().select_related("user").order_by("user__full_name")
        drivers_result = []
        for d in all_drivers:
            is_free, reason = is_driver_free(d, start_dt, end_dt, driver_trips=driver_trips)
            if is_free or include_unavailable:
                last_trip_info = driver_last_trip.get(d.id, "No prior trips")
                wl = driver_trips_today.get(d.id, {"count": 0, "hours": 0.0})

                drivers_result.append({
                    "id": d.id,
                    "name": d.user.full_name if d.user else "Driver",
                    "phone": d.user.phone if (d.user and d.user.phone) else "",
                    "email": d.user.email if d.user else "",
                    "license_number": d.license_number,
                    "license_expiry": d.license_expiry.isoformat() if d.license_expiry else None,
                    "verification_status": "VERIFIED" if (d.user and d.user.approval_status == User.ApprovalStatus.APPROVED) else "VERIFIED",
                    "trips_today": wl["count"],
                    "hours_today": round(wl["hours"], 1),
                    "available": is_free,
                    "reason": reason,
                    "last_trip": last_trip_info,
                })

        # Free vehicle and driver objects for recommendation
        free_vehicle_ids = {vr["id"] for vr in vehicles_result if vr["available"]}
        free_driver_ids = {dr["id"] for dr in drivers_result if dr["available"]}
        free_v_objs = [v for v in all_vehicles if v.id in free_vehicle_ids]
        free_d_objs = [d for d in all_drivers if d.id in free_driver_ids]

        recommended = get_recommended_assignment(
            booking=booking,
            bus_schedule=bus_schedule,
            free_vehicles=free_v_objs,
            free_drivers=free_d_objs,
            start_dt=start_dt,
            end_dt=end_dt,
            vehicle_trips_today=vehicle_trips_today,
            driver_trips_today=driver_trips_today,
        )

        # Timeline Busy intervals for the day
        day_trips = Trip.objects.filter(
            scheduled_datetime__date=start_dt.date(),
            status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS, Trip.Status.COMPLETED],
        ).select_related("booking")
        busy_intervals = []
        for dt in day_trips:
            b = dt.booking
            d_dist = (getattr(b, "estimated_distance_km", None) or getattr(b, "distance_km", None)) if b else None
            w_s, w_e = trip_time_window(dt.scheduled_datetime, d_dist)
            if dt.vehicle_id:
                busy_intervals.append({
                    "entity_type": "vehicle",
                    "entity_id": dt.vehicle_id,
                    "trip_id": dt.id,
                    "start": w_s.isoformat(),
                    "end": w_e.isoformat(),
                    "status": dt.status,
                    "label": f"Trip #{dt.id}",
                })
            if dt.driver_id:
                busy_intervals.append({
                    "entity_type": "driver",
                    "entity_id": dt.driver_id,
                    "trip_id": dt.id,
                    "start": w_s.isoformat(),
                    "end": w_e.isoformat(),
                    "status": dt.status,
                    "label": f"Trip #{dt.id}",
                })

        return Response({
            "stats": get_trip_assignment_stats(),
            "target": target_summary,
            "window": {
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat(),
            },
            "recommended": recommended,
            "busy_intervals": busy_intervals,
            "vehicles": vehicles_result,
            "drivers": drivers_result,
        })

    @extend_schema(
        tags=["Trips"],
        summary="Assign trip",
        description="Assign a vehicle and driver to an approved booking or confirmed bus schedule (Admin/Manager only).",
        request=TripAssignSerializer,
        responses={201: TripSerializer},
    )
    @action(detail=False, methods=["post"], url_path="assign")
    def assign(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can assign trips."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TripAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        booking = data.get("booking")
        bus_schedule = data.get("bus_schedule")
        vehicle = data["vehicle"]
        driver = data["driver"]
        source = data["source"]
        destination = data["destination"]
        scheduled_datetime = data["scheduled_datetime"]

        # Section 6: Vehicle Assignment Business Rules
        if booking:
            # Case 3: Vehicle type is missing
            if not booking.vehicle_type:
                return Response(
                    {"detail": "Booking is missing vehicle type. Cannot automatically assign a vehicle. Please resolve booking information first."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Case 1: Customer selects a specific fleet vehicle
            if booking.vehicle_id:
                if vehicle.id != booking.vehicle_id:
                    return Response(
                        {
                            "detail": f"Customer specifically selected vehicle {booking.vehicle.registration_number}. Manager must not assign a different vehicle."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            # Case 2: Customer selects only a vehicle type
            else:
                if vehicle.vehicle_type != booking.vehicle_type:
                    return Response(
                        {
                            "detail": f"Vehicle type mismatch: Cannot assign a {vehicle.vehicle_type} to a {booking.vehicle_type} booking."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # Check vehicle compliance documents
        warnings = []
        today = timezone.localdate()
        vehicle_docs = Document.objects.filter(vehicle=vehicle)

        if not vehicle_docs.exists():
            warnings.append(f"Vehicle {vehicle.registration_number} has no compliance documents registered.")
        else:
            expired_critical = vehicle_docs.filter(
                doc_type__in=[Document.DocType.INSURANCE, Document.DocType.REGISTRATION_RC],
                expiry_date__lt=today,
            )
            if expired_critical.exists():
                details = ", ".join(
                    f"{d.get_doc_type_display()} (expired on {d.expiry_date})" for d in expired_critical
                )
                if getattr(settings, "BLOCK_TRIPS_ON_EXPIRED_DOCUMENTS", True):
                    return Response(
                        {
                            "detail": f"Cannot assign trip: Vehicle {vehicle.registration_number} has expired documents: {details}."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    warnings.append(f"Vehicle {vehicle.registration_number} has expired documents: {details}.")

        with transaction.atomic():
            # Lock the vehicle and driver rows to prevent race conditions during double-assignment
            v_locked = Vehicle.objects.select_for_update().get(pk=vehicle.pk)
            d_locked = Driver.objects.select_for_update().get(pk=driver.pk)

            # Re-check availability within transaction using shared rules
            dist_km = (booking.estimated_distance_km or getattr(booking, "distance_km", None)) if booking else None
            t_start, t_end = trip_time_window(scheduled_datetime, dist_km)

            v_ok, v_reason = is_vehicle_free(v_locked, t_start, t_end, booking=booking, bus_schedule=bus_schedule)
            if not v_ok:
                return Response(
                    {"detail": f"Vehicle is not available: {v_reason}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            d_ok, d_reason = is_driver_free(d_locked, t_start, t_end)
            if not d_ok:
                return Response(
                    {"detail": f"Driver is not available: {d_reason}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            dispatch_note = data.get("dispatch_note", "").strip()
            trip = Trip.objects.create(
                booking=booking,
                bus_schedule=bus_schedule,
                vehicle=vehicle,
                driver=driver,
                source=source,
                destination=destination,
                scheduled_datetime=scheduled_datetime,
                dispatch_note=dispatch_note,
                assigned_by=request.user,
                status=Trip.Status.SCHEDULED,
            )

            # Resolve places and route in background thread with 4s timeout (non-blocking)
            resolve_trip_route_async(trip.id)

            # Log assignment
            TripAssignmentLog.objects.create(
                trip=trip,
                action=TripAssignmentLog.Action.ASSIGNED,
                performed_by=request.user,
                new_vehicle=vehicle,
                new_driver=driver,
                reason=dispatch_note or "Initial trip assignment",
            )

            # If vehicle booking, attach vehicle to booking
            if booking:
                booking.vehicle = vehicle
                booking.save(update_fields=["vehicle"])

            # Notify the driver
            driver_msg = (
                f"You have been assigned trip #{trip.id} ({trip.source} to {trip.destination}) "
                f"scheduled for {trip.scheduled_datetime.strftime('%Y-%m-%d %H:%M')}."
            )
            if trip.dispatch_note:
                driver_msg += f" Note: {trip.dispatch_note}"

            notify(
                user=driver.user,
                title="New Trip Assigned",
                message=driver_msg,
                type=Notification.NotificationType.TRIP,
                item_type="trip",
                item_id=trip.id,
            )

            # Notify customer(s)
            if booking:
                notify(
                    user=booking.customer,
                    title="Driver Assigned to Your Booking",
                    message=(
                        f"Driver {driver.user.full_name} "
                        f"has been assigned to your booking #{booking.id} with vehicle {vehicle.registration_number} ({vehicle.brand} {vehicle.model})."
                    ),
                    type=Notification.NotificationType.TRIP,
                    item_type="booking",
                    item_id=booking.id,
                )
            elif bus_schedule:
                active_bookings = bus_schedule.bookings.exclude(
                    status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
                ).select_related("customer")
                for b in active_bookings:
                    notify(
                        user=b.customer,
                        title="Driver Assigned to Bus Trip",
                        message=(
                            f"Driver {driver.user.full_name} has been assigned to your bus trip "
                            f"from {bus_schedule.source} to {bus_schedule.destination}."
                        ),
                        type=Notification.NotificationType.TRIP,
                        item_type="booking",
                        item_id=b.id,
                    )

            # Send assignment confirmation email to the driver
            try:
                email_sent = send_driver_assignment_email(trip)
                if email_sent:
                    warnings.append("Notification email sent to driver successfully.")
                else:
                    logger.warning("Could not send assignment notification email to driver %s", getattr(driver.user, "email", None))
            except Exception as e_err:
                logger.error("Driver assignment email error for trip #%s: %s", trip.id, e_err)

        resp_data = TripSerializer(trip).data
        if warnings:
            resp_data["warnings"] = warnings
        return Response(resp_data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=["Trips"],
        summary="Live trips",
        description="Get all in-progress trips with their last known locations (Admin/Manager only).",
        responses={200: TripSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="live")
    def live(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can view live trips."},
                status=status.HTTP_403_FORBIDDEN,
            )

        in_progress_trips = (
            Trip.objects.filter(status=Trip.Status.IN_PROGRESS)
            .select_related("vehicle", "driver", "driver__user", "booking", "bus_schedule")
            .prefetch_related("locations")
        )
        return Response(TripSerializer(in_progress_trips, many=True).data)

    @extend_schema(
        tags=["Trips"],
        summary="Trip Monitoring Telemetry",
        description="Single-query telemetry for all IN_PROGRESS trips with subqueried latest GPS location, route progress, and status flags.",
    )
    @action(detail=False, methods=["get"], url_path="monitor")
    def monitor(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can view trip monitoring telemetry."},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        latest_loc = TripLocation.objects.filter(trip=OuterRef("pk")).order_by("-recorded_at")

        trips = (
            Trip.objects.filter(status=Trip.Status.IN_PROGRESS)
            .select_related(
                "vehicle",
                "driver",
                "driver__user",
                "booking",
                "booking__customer",
                "bus_schedule",
            )
            .annotate(
                last_lat=Subquery(latest_loc.values("latitude")[:1]),
                last_lng=Subquery(latest_loc.values("longitude")[:1]),
                last_speed=Subquery(latest_loc.values("speed_kmh")[:1]),
                last_heading=Subquery(latest_loc.values("heading")[:1]),
                last_accuracy=Subquery(latest_loc.values("accuracy_m")[:1]),
                last_simulated=Subquery(latest_loc.values("is_simulated")[:1]),
                last_time=Subquery(latest_loc.values("recorded_at")[:1]),
            )
            .order_by("-started_at", "-id")
        )

        results = []
        for t in trips:
            # Customer first name only (strictly no phone numbers anywhere)
            cust_first_name = ""
            if t.booking and t.booking.customer:
                c = t.booking.customer
                first = getattr(c, "first_name", "")
                if first:
                    cust_first_name = first
                elif getattr(c, "full_name", ""):
                    cust_first_name = c.full_name.split()[0]
                elif getattr(c, "name", ""):
                    cust_first_name = c.name.split()[0]
                else:
                    cust_first_name = "Customer"
            elif t.bus_schedule:
                cust_first_name = "Bus Passengers"
            else:
                cust_first_name = "Passenger"

            # Lazily resolve places and route if missing
            if t.pickup_lat is None or t.drop_lat is None or not t.route_geojson:
                resolve_trip_route_async(t.id)

            last_location = None
            is_no_signal = True
            is_stale = False
            is_live = False
            is_off_route = False
            progress_pct = 0
            distance_left_km = float(t.route_distance_km or 0.0)

            if t.last_lat is not None and t.last_lng is not None:
                is_no_signal = False
                time_diff = (now - t.last_time).total_seconds() if t.last_time else 9999
                is_stale = time_diff > 120.0
                is_live = not is_stale

                last_location = {
                    "lat": float(t.last_lat),
                    "lng": float(t.last_lng),
                    "latitude": float(t.last_lat),
                    "longitude": float(t.last_lng),
                    "speed": float(t.last_speed) if t.last_speed is not None else None,
                    "speed_kmh": float(t.last_speed) if t.last_speed is not None else None,
                    "heading": float(t.last_heading) if t.last_heading is not None else None,
                    "accuracy_m": float(t.last_accuracy) if t.last_accuracy is not None else None,
                    "is_simulated": bool(t.last_simulated),
                    "time": t.last_time.isoformat() if t.last_time else None,
                    "recorded_at": t.last_time.isoformat() if t.last_time else None,
                }

                if t.route_geojson:
                    p_res = compute_route_progress(t.route_geojson, t.last_lat, t.last_lng)
                    progress_pct = p_res["progress_percent"]
                    distance_left_km = p_res["distance_left_km"]
                    is_off_route = p_res["is_off_route"]

            # Compute ETA using subqueried speed (0 extra queries for 100% single-query efficiency)
            effective_speed = 30.0
            if t.last_speed is not None and float(t.last_speed) > 0:
                effective_speed = max(20.0, float(t.last_speed))
            elif t.route_distance_km and t.route_duration_min and float(t.route_duration_min) > 0:
                calc_spd = (float(t.route_distance_km) / float(t.route_duration_min)) * 60.0
                effective_speed = max(20.0, calc_spd)

            eta_min = (
                0
                if distance_left_km <= 0.05
                else max(1, int(round((distance_left_km / effective_speed) * 60.0)))
            )
            eta_clock = (now + timedelta(minutes=eta_min)).strftime("%I:%M %p") if eta_min > 0 else "Arriving"

            status_flags = []
            if is_no_signal:
                status_flags.append("NO_SIGNAL")
            elif is_stale:
                status_flags.append("STALE")
            elif is_live:
                status_flags.append("LIVE")
            if is_off_route:
                status_flags.append("OFF_ROUTE")

            results.append({
                "id": t.id,
                "trip_id": t.id,
                "booking_id": t.booking.id if t.booking else None,
                "plate": t.vehicle.registration_number if t.vehicle else "-",
                "vehicle_registration": t.vehicle.registration_number if t.vehicle else "-",
                "vehicle_type": t.vehicle.vehicle_type if t.vehicle else "CAR",
                "vehicle_model": f"{t.vehicle.brand} {t.vehicle.model}" if t.vehicle else "-",
                "vehicle_brand_model": f"{t.vehicle.brand} {t.vehicle.model}" if t.vehicle else "-",
                "vehicle_capacity": getattr(t.vehicle, "seating_capacity", None) if t.vehicle else None,
                "driver_id": t.driver.id if t.driver else None,
                "driver_name": t.driver.user.full_name or t.driver.user.username if t.driver and t.driver.user else "Assigned Driver",
                "driver_license": t.driver.license_number if t.driver else "",
                "driver_rating": 4.9,
                "customer_first_name": cust_first_name,
                "customer_name": cust_first_name,
                "source": t.source or "-",
                "destination": t.destination or "-",
                "pickup_location": t.source or "-",
                "drop_location": t.destination or "-",
                "scheduled_datetime": t.scheduled_datetime.isoformat() if t.scheduled_datetime else None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "pickup_lat": float(t.pickup_lat) if t.pickup_lat is not None else None,
                "pickup_lng": float(t.pickup_lng) if t.pickup_lng is not None else None,
                "drop_lat": float(t.drop_lat) if t.drop_lat is not None else None,
                "drop_lng": float(t.drop_lng) if t.drop_lng is not None else None,
                "geo_status": t.geo_status,
                "route_source": t.route_source,
                "route_distance_km": float(t.route_distance_km) if t.route_distance_km is not None else None,
                "route_duration_min": t.route_duration_min,
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "start_odometer": t.start_odometer,
                "last_location": last_location,
                "progress_percent": progress_pct,
                "distance_left_km": distance_left_km,
                "eta_minutes": eta_min,
                "eta_clock": eta_clock,
                "eta_display": f"{eta_min} min" if eta_min > 0 else "Arriving",
                "status_flags": status_flags,
                "is_live": is_live,
                "is_stale": is_stale,
                "is_no_signal": is_no_signal,
                "is_off_route": is_off_route,
                "status": t.status,
            })

        return Response(results)

    @extend_schema(
        tags=["Trips"],
        summary="Trip Track & Telemetry Trail",
        description="Detailed route, places, telemetry trail, and live flags for a specific trip.",
    )
    @action(detail=True, methods=["get"], url_path="track")
    def track(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can track trips."},
                status=status.HTTP_403_FORBIDDEN,
            )

        trip = self.get_object()

        # If trip lacks geo coordinates, attempt lazy resolution
        if trip.pickup_lat is None or trip.drop_lat is None or not trip.route_geojson:
            resolve_trip_route(trip)

        now = timezone.now()
        since = request.query_params.get("since")
        since_dt = None
        if since:
            try:
                since_dt = timezone.datetime.fromisoformat(since.replace("Z", "+00:00"))
            except Exception:
                pass

        trail_qs = trip.locations.all().order_by("recorded_at")
        if trip.status == Trip.Status.SCHEDULED:
            trail_qs = TripLocation.objects.none()
        elif since_dt and trip.status == Trip.Status.IN_PROGRESS:
            trail_qs = trail_qs.filter(recorded_at__gt=since_dt)

        trail_data = [
            {
                "lat": float(loc.latitude),
                "lng": float(loc.longitude),
                "latitude": float(loc.latitude),
                "longitude": float(loc.longitude),
                "speed_kmh": float(loc.speed_kmh) if loc.speed_kmh is not None else None,
                "heading": float(loc.heading) if loc.heading is not None else None,
                "accuracy_m": float(loc.accuracy_m) if loc.accuracy_m is not None else None,
                "is_simulated": bool(loc.is_simulated),
                "time": loc.recorded_at.isoformat(),
                "recorded_at": loc.recorded_at.isoformat(),
            }
            for loc in trail_qs
        ]

        latest_loc = trip.locations.order_by("-recorded_at").first()
        last_location = None
        is_no_signal = True
        is_stale = False
        is_live = False
        is_off_route = False
        progress_pct = 0
        distance_left_km = float(trip.route_distance_km or 0.0)
        distance_travelled_km = 0.0

        if latest_loc:
            is_no_signal = False
            time_diff = (now - latest_loc.recorded_at).total_seconds()
            is_stale = time_diff > 120.0
            is_live = not is_stale

            last_location = {
                "lat": float(latest_loc.latitude),
                "lng": float(latest_loc.longitude),
                "latitude": float(latest_loc.latitude),
                "longitude": float(latest_loc.longitude),
                "speed_kmh": float(latest_loc.speed_kmh) if latest_loc.speed_kmh is not None else None,
                "heading": float(latest_loc.heading) if latest_loc.heading is not None else None,
                "accuracy_m": float(latest_loc.accuracy_m) if latest_loc.accuracy_m is not None else None,
                "is_simulated": bool(latest_loc.is_simulated),
                "time": latest_loc.recorded_at.isoformat(),
                "recorded_at": latest_loc.recorded_at.isoformat(),
            }

            if trip.route_geojson:
                p_res = compute_route_progress(trip.route_geojson, latest_loc.latitude, latest_loc.longitude)
                progress_pct = p_res["progress_percent"]
                distance_left_km = p_res["distance_left_km"]
                distance_travelled_km = p_res["travelled_km"]
                is_off_route = p_res["is_off_route"]
        elif trip.status == Trip.Status.COMPLETED and trip.route_distance_km:
            progress_pct = 100
            distance_left_km = 0.0
            distance_travelled_km = float(trip.route_distance_km)

        eta_min = compute_trip_eta_minutes(trip, distance_left_km)
        eta_clock = (now + timedelta(minutes=eta_min)).strftime("%I:%M %p") if eta_min > 0 else "Arrived"

        status_flags = []
        if is_no_signal:
            status_flags.append("NO_SIGNAL")
        elif is_stale:
            status_flags.append("STALE")
        elif is_live:
            status_flags.append("LIVE")
        if is_off_route:
            status_flags.append("OFF_ROUTE")

        cust_name = "Customer"
        cust_phone = ""
        booking_id = None
        if trip.booking:
            booking_id = trip.booking.id
            if trip.booking.customer:
                c = trip.booking.customer
                cust_name = getattr(c, "full_name", "") or getattr(c, "name", "") or c.username or "Customer"
                cust_phone = getattr(c, "phone", "") or getattr(c, "phone_number", "") or ""
        elif trip.bus_schedule:
            cust_name = f"Bus Passengers ({trip.bus_schedule.booked_seats} booked)"

        driver_user = trip.driver.user if trip.driver else None
        driver_name = getattr(driver_user, "full_name", "") or getattr(driver_user, "username", "") if driver_user else "Driver"
        driver_phone = getattr(driver_user, "phone", "") or getattr(driver_user, "phone_number", "") if driver_user else ""
        driver_license = trip.driver.license_number if trip.driver else ""
        driver_id = trip.driver.id if trip.driver else None

        vehicle_reg = trip.vehicle.registration_number if trip.vehicle else "-"
        vehicle_model = f"{trip.vehicle.brand} {trip.vehicle.model}" if trip.vehicle else "-"
        vehicle_type = trip.vehicle.vehicle_type if trip.vehicle else "CAR"
        vehicle_capacity = getattr(trip.vehicle, "seating_capacity", None) if trip.vehicle else None

        return Response({
            "trip": {
                "id": trip.id,
                "trip_id": trip.id,
                "booking_id": booking_id,
                "status": trip.status,
                "plate": vehicle_reg,
                "vehicle_registration": vehicle_reg,
                "vehicle_type": vehicle_type,
                "vehicle_model": vehicle_model,
                "vehicle_brand_model": vehicle_model,
                "vehicle_capacity": vehicle_capacity,
                "driver_id": driver_id,
                "driver_name": driver_name,
                "driver_license": driver_license,
                "driver_rating": 4.9,
                "customer_name": cust_name,
                "source": trip.source,
                "destination": trip.destination,
                "pickup_location": trip.source,
                "drop_location": trip.destination,
                "scheduled_datetime": trip.scheduled_datetime.isoformat() if trip.scheduled_datetime else None,
                "created_at": trip.created_at.isoformat() if trip.created_at else None,
                "pickup_lat": float(trip.pickup_lat) if trip.pickup_lat is not None else None,
                "pickup_lng": float(trip.pickup_lng) if trip.pickup_lng is not None else None,
                "drop_lat": float(trip.drop_lat) if trip.drop_lat is not None else None,
                "drop_lng": float(trip.drop_lng) if trip.drop_lng is not None else None,
                "geo_status": trip.geo_status,
                "route_source": trip.route_source,
                "route_distance_km": float(trip.route_distance_km) if trip.route_distance_km is not None else None,
                "route_duration_min": trip.route_duration_min,
                "started_at": trip.started_at.isoformat() if trip.started_at else None,
                "completed_at": trip.completed_at.isoformat() if trip.completed_at else None,
                "start_odometer": trip.start_odometer,
                "end_odometer": trip.end_odometer,
                "distance_km": float(trip.distance_km) if trip.distance_km is not None else None,
                "total_fare": str(trip.total_fare) if trip.total_fare is not None else None,
                "dispatch_note": trip.dispatch_note,
            },
            "route_geojson": trip.route_geojson,
            "trail": trail_data,
            "last_location": last_location,
            "progress_percent": progress_pct,
            "distance_left_km": distance_left_km,
            "distance_travelled_km": distance_travelled_km,
            "eta_minutes": eta_min,
            "eta_clock": eta_clock,
            "eta_display": f"{eta_min} min" if eta_min > 0 else "Arriving",
            "status_flags": status_flags,
            "is_live": is_live,
            "is_stale": is_stale,
            "is_no_signal": is_no_signal,
            "is_off_route": is_off_route,
        })

    @extend_schema(
        tags=["Trips"],
        summary="Set Trip Places & Coordinates",
        description="Manually sets pickup and drop pin coordinates and triggers OSRM route recomputation (Admin/Manager only).",
    )
    @action(detail=True, methods=["patch"], url_path="places")
    def places(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can update trip places."},
                status=status.HTTP_403_FORBIDDEN,
            )

        trip = self.get_object()
        serializer = TripPlacesUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "pickup_lat" in data and data["pickup_lat"] is not None:
            trip.pickup_lat = data["pickup_lat"]
        if "pickup_lng" in data and data["pickup_lng"] is not None:
            trip.pickup_lng = data["pickup_lng"]
        if "drop_lat" in data and data["drop_lat"] is not None:
            trip.drop_lat = data["drop_lat"]
        if "drop_lng" in data and data["drop_lng"] is not None:
            trip.drop_lng = data["drop_lng"]

        trip.geo_status = "MANUAL"
        resolve_trip_route(trip, force_recompute=True)

        return Response({
            "id": trip.id,
            "pickup_lat": float(trip.pickup_lat) if trip.pickup_lat else None,
            "pickup_lng": float(trip.pickup_lng) if trip.pickup_lng else None,
            "drop_lat": float(trip.drop_lat) if trip.drop_lat else None,
            "drop_lng": float(trip.drop_lng) if trip.drop_lng else None,
            "geo_status": trip.geo_status,
            "route_source": trip.route_source,
            "route_distance_km": float(trip.route_distance_km) if trip.route_distance_km else None,
            "route_duration_min": trip.route_duration_min,
            "route_geojson": trip.route_geojson,
        })

    @extend_schema(
        tags=["Trips"],
        summary="Driver my-trips",
        description="Get driver's trips with optional status filter (Driver only).",
        parameters=[
            OpenApiParameter(name="status", description="Filter by status (SCHEDULED, IN_PROGRESS, COMPLETED, upcoming, in_progress, completed)", required=False, type=str),
        ],
        responses={200: TripSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="my-trips")
    def my_trips(self, request):
        if request.user.role != User.Role.DRIVER:
            return Response(
                {"detail": "Only drivers can access my-trips."},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        # Automatically mark passed scheduled trips that were never started as EXPIRED
        Trip.objects.filter(
            driver__user=request.user,
            status=Trip.Status.SCHEDULED,
            scheduled_datetime__lt=now,
        ).update(status=Trip.Status.EXPIRED)

        qs = (
            Trip.objects.filter(driver__user=request.user)
            .exclude(status=Trip.Status.EXPIRED)
            .select_related("vehicle", "driver", "driver__user", "booking", "booking__customer", "bus_schedule")
            .prefetch_related("payments")
        )

        status_param = request.query_params.get("status")
        if status_param and status_param.lower() != "all":
            normalized = status_param.upper().replace("-", "_")
            if normalized in ["UPCOMING", "SCHEDULED", "ASSIGNED"]:
                qs = qs.filter(status=Trip.Status.SCHEDULED, scheduled_datetime__gte=now)
            elif normalized in ["IN_PROGRESS", "INPROGRESS"]:
                qs = qs.filter(status=Trip.Status.IN_PROGRESS)
            elif normalized in ["COMPLETED"]:
                qs = qs.filter(status=Trip.Status.COMPLETED)
            elif normalized in ["CANCELLED"]:
                qs = qs.filter(status=Trip.Status.CANCELLED)

        search_query = request.query_params.get("search", "").strip()
        if search_query:
            from django.db.models import Q
            q_filter = (
                Q(vehicle__registration_number__icontains=search_query)
                | Q(vehicle__brand__icontains=search_query)
                | Q(vehicle__model__icontains=search_query)
                | Q(vehicle__vehicle_type__icontains=search_query)
                | Q(booking__customer__first_name__icontains=search_query)
                | Q(booking__customer__last_name__icontains=search_query)
                | Q(booking__customer__email__icontains=search_query)
                | Q(source__icontains=search_query)
                | Q(destination__icontains=search_query)
            )
            clean_digits = search_query.lstrip("#")
            if clean_digits.isdigit():
                q_filter |= Q(id=int(clean_digits)) | Q(booking_id=int(clean_digits))
            qs = qs.filter(q_filter)

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(TripSerializer(page, many=True).data)

        return Response(TripSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], url_path="my-trips-summary")
    def my_trips_summary(self, request):
        if request.user.role != User.Role.DRIVER:
            return Response(
                {"detail": "Only drivers can access summary."},
                status=status.HTTP_403_FORBIDDEN,
            )
        now = timezone.now()
        # Automatically mark passed scheduled trips that were never started as EXPIRED
        Trip.objects.filter(
            driver__user=request.user,
            status=Trip.Status.SCHEDULED,
            scheduled_datetime__lt=now,
        ).update(status=Trip.Status.EXPIRED)

        base = Trip.objects.filter(driver__user=request.user)
        return Response({
            "total": base.exclude(status=Trip.Status.EXPIRED).count(),
            "upcoming": base.filter(status=Trip.Status.SCHEDULED, scheduled_datetime__gte=now).count(),
            "in_progress": base.filter(status=Trip.Status.IN_PROGRESS).count(),
            "completed": base.filter(status=Trip.Status.COMPLETED).count(),
            "cancelled": base.filter(status=Trip.Status.CANCELLED).count(),
            "expired": base.filter(status=Trip.Status.EXPIRED).count(),
        })

    @extend_schema(
        tags=["Trips"],
        summary="Start trip",
        description="Driver starts the trip by submitting starting odometer reading.",
        request=TripStartSerializer,
        responses={200: TripSerializer},
    )
    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk=None):
        trip = self.get_object()

        if trip.driver.user_id != request.user.id:
            return Response(
                {"detail": "Only the assigned driver can start this trip."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if trip.status != Trip.Status.SCHEDULED:
            return Response(
                {"detail": f"Trip cannot be started because its status is {trip.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rule = getattr(settings, "TRIP_START_RULE", "same_day")
        if rule != "any" and trip.scheduled_datetime:
            today = timezone.localdate()
            trip_date = timezone.localdate(trip.scheduled_datetime)
            formatted_date = f"{trip_date.day} {trip_date.strftime('%b %Y')}"
            if today < trip_date:
                return Response(
                    {
                        "code": "TRIP_NOT_TODAY",
                        "message": f"This trip can be started only on {formatted_date}.",
                        "detail": f"This trip can be started only on {formatted_date}.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            elif today > trip_date:
                return Response(
                    {
                        "code": "TRIP_DATE_PASSED",
                        "message": "The trip date has passed. Ask your Fleet Manager to reschedule or cancel it.",
                        "detail": "The trip date has passed. Ask your Fleet Manager to reschedule or cancel it.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = TripStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        start_odo = serializer.validated_data.get("start_odometer")

        # Validate against vehicle's previous recorded odometer
        prev_odo = 0
        if trip.vehicle:
            last_trip = (
                Trip.objects.filter(
                    vehicle=trip.vehicle,
                    end_odometer__isnull=False,
                    status=Trip.Status.COMPLETED,
                )
                .exclude(id=trip.id)
                .order_by("-completed_at", "-id")
                .first()
            )
            if last_trip and last_trip.end_odometer:
                prev_odo = last_trip.end_odometer

        if start_odo is None:
            start_odo = prev_odo if prev_odo > 0 else 0
        elif prev_odo > 0 and start_odo < prev_odo:
            return Response(
                {
                    "code": "INVALID_START_ODOMETER",
                    "start_odometer": [
                        f"Starting odometer ({start_odo} km) cannot be less than vehicle's previous recorded odometer ({prev_odo} km)."
                    ],
                    "message": f"Starting odometer ({start_odo} km) cannot be less than vehicle's previous recorded odometer ({prev_odo} km).",
                    "detail": f"Starting odometer ({start_odo} km) cannot be less than vehicle's previous recorded odometer ({prev_odo} km).",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            trip.status = Trip.Status.IN_PROGRESS
            trip.started_at = timezone.now()
            trip.start_odometer = start_odo
            trip.save(update_fields=["status", "started_at", "start_odometer", "updated_at"])

            # Set vehicle and driver status to ON_TRIP
            trip.vehicle.status = Vehicle.Status.ON_TRIP
            trip.vehicle.save(update_fields=["status"])

            trip.driver.status = Driver.Status.ON_TRIP
            trip.driver.save(update_fields=["status"])

            # Notify customer(s)
            if trip.booking:
                notify(
                    user=trip.booking.customer,
                    title="Your Trip Has Started",
                    message="Your trip has started.",
                    type=Notification.NotificationType.TRIP,
                )
            elif trip.bus_schedule:
                active_bookings = trip.bus_schedule.bookings.exclude(
                    status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
                ).select_related("customer")
                for b in active_bookings:
                    notify(
                        user=b.customer,
                        title="Bus Trip Started",
                        message="Your trip has started.",
                        type=Notification.NotificationType.TRIP,
                    )

        return Response(TripSerializer(trip).data)

    @extend_schema(
        tags=["Trips"],
        summary="Update live location",
        description="Driver uploads live GPS coordinates during an in-progress trip.",
        request=TripLocationUpdateSerializer,
        responses={201: TripLocationSerializer},
    )
    @action(detail=True, methods=["post"], url_path="location")
    def location(self, request, pk=None):
        trip = self.get_object()

        if trip.driver.user_id != request.user.id:
            return Response(
                {"detail": "Only the assigned driver can submit location updates."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if trip.status != Trip.Status.IN_PROGRESS:
            return Response(
                {"detail": "Location updates can only be recorded for IN_PROGRESS trips."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TripLocationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lat = serializer.validated_data["latitude"]
        lon = serializer.validated_data["longitude"]
        speed_kmh = serializer.validated_data.get("speed_kmh")
        heading = serializer.validated_data.get("heading")
        accuracy_m = serializer.validated_data.get("accuracy_m")
        is_simulated = serializer.validated_data.get("is_simulated", False)

        with transaction.atomic():
            loc = TripLocation.objects.create(
                trip=trip,
                latitude=lat,
                longitude=lon,
                speed_kmh=speed_kmh,
                heading=heading,
                accuracy_m=accuracy_m,
                is_simulated=is_simulated,
            )

            # Keep only the last 2000 points per trip for trail inspection
            keep_ids = list(
                TripLocation.objects.filter(trip=trip)
                .order_by("-recorded_at")
                .values_list("id", flat=True)[:2000]
            )
            TripLocation.objects.filter(trip=trip).exclude(id__in=keep_ids).delete()

        return Response(TripLocationSerializer(loc).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=["Trips"],
        summary="Trip fare preview",
        description="Driver previews fare during trip before completion.",
    )
    @action(detail=True, methods=["get"], url_path="fare-preview")
    def fare_preview(self, request, pk=None):
        trip = self.get_object()

        if trip.driver.user_id != request.user.id:
            return Response(
                {"detail": "Only the assigned driver can preview the fare for this trip."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if trip.status != Trip.Status.IN_PROGRESS:
            return Response(
                {"detail": f"Fare preview is only available for IN_PROGRESS trips (current: {trip.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .services import calculate_trip_fare
        try:
            fare_data = calculate_trip_fare(
                trip,
                end_odometer=request.query_params.get("end_odometer"),
                distance_km=request.query_params.get("distance_km"),
                additional_charges=request.query_params.get("additional_charges", "0.00"),
            )
        except ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "start_odometer": fare_data["start_odometer"],
            "end_odometer": fare_data["end_odometer"],
            "distance_km": float(fare_data["distance_km"]),
            "rate_per_km": float(fare_data["rate_per_km"]),
            "base_fare": str(fare_data.get("base_fare", "0.00")),
            "distance_fare": str(fare_data.get("distance_fare", fare_data["fare"])),
            "additional_charges": str(fare_data.get("additional_charges", "0.00")),
            "fare": str(fare_data["fare"]),
            "breakdown": fare_data["breakdown"],
        })

    @extend_schema(
        tags=["Trips"],
        summary="Complete trip",
        description="Driver completes trip by submitting ending odometer and/or distance. Calculates fare on server.",
        request=TripCompleteSerializer,
        responses={200: TripSerializer},
    )
    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        trip = self.get_object()

        if trip.driver.user_id != request.user.id:
            return Response(
                {"detail": "Only the assigned driver can complete this trip."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if trip.status != Trip.Status.IN_PROGRESS:
            return Response(
                {"detail": f"Trip cannot be completed because its status is {trip.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TripCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .services import calculate_trip_fare
        try:
            fare_data = calculate_trip_fare(
                trip,
                end_odometer=serializer.validated_data.get("end_odometer"),
                distance_km=serializer.validated_data.get("distance_km"),
                additional_charges=serializer.validated_data.get("additional_charges", Decimal("0.00")),
            )
        except ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)

        end_odo = fare_data["end_odometer"]
        total_fare = fare_data["fare"]
        actual_pickup = serializer.validated_data.get("actual_pickup")
        actual_drop = serializer.validated_data.get("actual_drop")
        remarks = serializer.validated_data.get("remarks")
        actual_start_time = serializer.validated_data.get("actual_start_time")
        actual_end_time = serializer.validated_data.get("actual_end_time")

        with transaction.atomic():
            trip.status = Trip.Status.COMPLETED
            trip.completed_at = actual_end_time or timezone.now()
            if actual_start_time:
                trip.started_at = actual_start_time
            if actual_pickup:
                trip.source = actual_pickup
            if actual_drop:
                trip.destination = actual_drop
            if remarks:
                trip.dispatch_note = (f"{trip.dispatch_note} | {remarks}" if trip.dispatch_note else remarks)[:300]
            trip.end_odometer = end_odo
            trip.total_fare = total_fare
            trip.save(update_fields=["status", "started_at", "completed_at", "source", "destination", "dispatch_note", "end_odometer", "total_fare", "updated_at"])

            # Free vehicle and driver
            trip.vehicle.status = Vehicle.Status.ACTIVE
            trip.vehicle.save(update_fields=["status"])

            trip.driver.status = Driver.Status.ACTIVE
            trip.driver.save(update_fields=["status"])

            # Complete booking(s) and set final fare
            if trip.booking:
                trip.booking.status = Booking.Status.COMPLETED
                trip.booking.final_fare = total_fare
                trip.booking.save(update_fields=["status", "final_fare", "updated_at"])

                notify(
                    user=trip.booking.customer,
                    title="Trip Completed",
                    message=f"Trip completed. Total fare is Rs. {total_fare}",
                    type=Notification.NotificationType.TRIP,
                )
            elif trip.bus_schedule:
                active_bookings = trip.bus_schedule.bookings.exclude(
                    status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
                ).select_related("customer")
                for b in active_bookings:
                    b.status = Booking.Status.COMPLETED
                    b.final_fare = b.estimated_fare
                    b.save(update_fields=["status", "final_fare", "updated_at"])

                    notify(
                        user=b.customer,
                        title="Trip Completed",
                        message=f"Trip completed. Total fare is Rs. {b.final_fare}",
                        type=Notification.NotificationType.TRIP,
                    )

            # Stage 6: Automatically create UNPAID payment records
            from payments.services import create_trip_payments
            created_payments = create_trip_payments(trip)
            payment_id = None
            if created_payments:
                payment_id = created_payments[0].id
            else:
                existing_p = trip.payments.first()
                if existing_p:
                    payment_id = existing_p.id

        data = TripSerializer(trip).data
        data["trip"] = TripSerializer(trip).data
        data["payment_id"] = payment_id
        data["fare"] = str(trip.total_fare)
        return Response(data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Trips"],
        summary="Download Trip Receipt PDF",
        description="Download formatted PDF receipt for a completed trip.",
    )
    @action(detail=True, methods=["get"], url_path="receipt/pdf")
    def receipt_pdf(self, request, pk=None):
        from django.http import HttpResponse
        from payments.services import create_payment_receipt
        from payments.pdf import generate_receipt_pdf

        trip = self.get_object()
        if trip.status != Trip.Status.COMPLETED:
            return Response(
                {"detail": "Receipt is only available for COMPLETED trips."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.role == User.Role.DRIVER and trip.driver.user_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        payment = trip.payments.first()
        if payment:
            if not hasattr(payment, "receipt") or not payment.receipt:
                receipt = create_payment_receipt(payment)
            else:
                receipt = payment.receipt
            pdf_bytes = generate_receipt_pdf(receipt)
            receipt_num = receipt.receipt_number
        else:
            receipt_num = f"FF-{timezone.now().year}-T{trip.id:05d}"
            fare_val = str(trip.total_fare or "0.00")
            dist_val = trip.distance_km or (trip.end_odometer - trip.start_odometer if trip.end_odometer and trip.start_odometer else 0)

            class SyntheticReceipt:
                def __init__(self, t):
                    self.receipt_number = receipt_num
                    self.payment = None
                    self.data = {
                        "receipt_number": receipt_num,
                        "payment_id": None,
                        "customer_name": "Bus Passengers" if t.bus_schedule else (t.booking.customer.full_name if t.booking and t.booking.customer else "Customer"),
                        "customer_email": t.booking.customer.email if t.booking and t.booking.customer else "",
                        "route": f"{t.source} to {t.destination}",
                        "vehicle": f"{t.vehicle.registration_number} ({t.vehicle.brand} {t.vehicle.model})" if t.vehicle else "N/A",
                        "driver": f"{t.driver.user.full_name} ({t.driver.license_number})" if t.driver and t.driver.user else "Assigned Driver",
                        "distance_km": dist_val,
                        "amount": fare_val,
                        "payment_method": "PASSENGER_BOOKINGS" if t.bus_schedule else "COMPLETED",
                        "gateway_reference": f"TRIP-{t.id}",
                        "paid_at": t.completed_at.isoformat() if t.completed_at else timezone.now().isoformat(),
                    }

            pdf_bytes = generate_receipt_pdf(SyntheticReceipt(trip))

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="receipt_{receipt_num}.pdf"'
        return response

    @extend_schema(
        tags=["Trips"],
        summary="Cancel trip",
        description="Cancel a scheduled trip, freeing vehicle and driver (Admin/Manager only).",
        responses={200: TripSerializer},
    )
    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can cancel trips."},
                status=status.HTTP_403_FORBIDDEN,
            )

        trip = self.get_object()

        if trip.status != Trip.Status.SCHEDULED:
            return Response(
                {"detail": f"Only SCHEDULED trips can be cancelled (current status: {trip.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            trip.status = Trip.Status.CANCELLED
            trip.save(update_fields=["status", "updated_at"])

            # Log cancellation
            TripAssignmentLog.objects.create(
                trip=trip,
                action=TripAssignmentLog.Action.CANCELLED,
                performed_by=request.user,
                old_vehicle=trip.vehicle,
                old_driver=trip.driver,
                reason=request.data.get("reason", "").strip() or "Cancelled by manager",
            )

            # Free vehicle and driver if not already active
            if trip.vehicle.status != Vehicle.Status.ACTIVE:
                trip.vehicle.status = Vehicle.Status.ACTIVE
                trip.vehicle.save(update_fields=["status"])

            if trip.driver.status != Driver.Status.ACTIVE:
                trip.driver.status = Driver.Status.ACTIVE
                trip.driver.save(update_fields=["status"])

            # Notify driver
            notify(
                user=trip.driver.user,
                title="Trip Cancelled",
                message=f"Trip #{trip.id} has been cancelled.",
                type=Notification.NotificationType.TRIP,
            )

            # Notify customer(s)
            if trip.booking:
                notify(
                    user=trip.booking.customer,
                    title="Trip Cancelled",
                    message=f"Your scheduled trip for booking #{trip.booking.id} has been cancelled.",
                    type=Notification.NotificationType.TRIP,
                )
            elif trip.bus_schedule:
                active_bookings = trip.bus_schedule.bookings.exclude(
                    status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
                ).select_related("customer")
                for b in active_bookings:
                    notify(
                        user=b.customer,
                        title="Bus Trip Cancelled",
                        message=f"The scheduled bus trip #{trip.id} has been cancelled.",
                        type=Notification.NotificationType.TRIP,
                    )

        return Response(TripSerializer(trip).data)

    @extend_schema(
        tags=["Trips"],
        summary="Reassign trip",
        description="Reassign vehicle and/or driver of a SCHEDULED trip (Admin/Manager only).",
        request=TripReassignSerializer,
        responses={200: TripSerializer},
    )
    @action(detail=True, methods=["post"], url_path="reassign")
    def reassign(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can reassign trips."},
                status=status.HTTP_403_FORBIDDEN,
            )

        trip = self.get_object()
        if trip.status != Trip.Status.SCHEDULED:
            return Response(
                {"detail": f"Only SCHEDULED trips can be reassigned (current status: {trip.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TripReassignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        new_vehicle_id = data.get("vehicle_id")
        new_driver_id = data.get("driver_id")
        reason = data.get("reason", "").strip()

        old_vehicle = trip.vehicle
        old_driver = trip.driver

        new_vehicle = old_vehicle
        new_driver = old_driver

        if new_vehicle_id:
            try:
                new_vehicle = Vehicle.objects.get(pk=new_vehicle_id)
            except Vehicle.DoesNotExist:
                return Response({"detail": "Vehicle not found."}, status=status.HTTP_404_NOT_FOUND)

        if new_driver_id:
            try:
                new_driver = Driver.objects.get(pk=new_driver_id)
            except Driver.DoesNotExist:
                return Response({"detail": "Driver not found."}, status=status.HTTP_404_NOT_FOUND)

        if new_vehicle == old_vehicle and new_driver == old_driver:
            return Response({"detail": "No vehicle or driver change requested."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            v_locked = Vehicle.objects.select_for_update().get(pk=new_vehicle.pk)
            d_locked = Driver.objects.select_for_update().get(pk=new_driver.pk)

            dist_km = (trip.booking.estimated_distance_km or getattr(trip.booking, "distance_km", None)) if trip.booking else None
            t_start, t_end = trip_time_window(trip.scheduled_datetime, dist_km)

            # Check vehicle availability if changed
            if new_vehicle != old_vehicle:
                v_ok, v_reason = is_vehicle_free(
                    v_locked,
                    t_start,
                    t_end,
                    booking=trip.booking,
                    bus_schedule=trip.bus_schedule,
                    exclude_trip_id=trip.id,
                )
                if not v_ok:
                    return Response({"detail": f"New vehicle is not available: {v_reason}"}, status=status.HTTP_400_BAD_REQUEST)

            # Check driver availability if changed
            if new_driver != old_driver:
                d_ok, d_reason = is_driver_free(
                    d_locked,
                    t_start,
                    t_end,
                    exclude_trip_id=trip.id,
                )
                if not d_ok:
                    return Response({"detail": f"New driver is not available: {d_reason}"}, status=status.HTTP_400_BAD_REQUEST)

            # Apply reassignment
            trip.vehicle = new_vehicle
            trip.driver = new_driver
            trip.save(update_fields=["vehicle", "driver", "updated_at"])

            if trip.booking and new_vehicle != old_vehicle:
                trip.booking.vehicle = new_vehicle
                trip.booking.save(update_fields=["vehicle"])

            # Log reassignment
            TripAssignmentLog.objects.create(
                trip=trip,
                action=TripAssignmentLog.Action.REASSIGNED,
                performed_by=request.user,
                old_vehicle=old_vehicle,
                new_vehicle=new_vehicle,
                old_driver=old_driver,
                new_driver=new_driver,
                reason=reason or "Trip reassigned by manager",
            )

            # Notifications
            # 1. Old driver (if changed)
            if new_driver != old_driver:
                notify(
                    user=old_driver.user,
                    title="Trip Reassigned",
                    message=f"Trip #{trip.id} ({trip.source} to {trip.destination}) has been reassigned to another driver and removed from your schedule.",
                    type=Notification.NotificationType.TRIP,
                    item_type="trip",
                    item_id=trip.id,
                )
                # 2. New driver
                new_drv_msg = f"You have been assigned trip #{trip.id} ({trip.source} to {trip.destination}) scheduled for {trip.scheduled_datetime.strftime('%Y-%m-%d %H:%M')}."
                if trip.dispatch_note:
                    new_drv_msg += f" Note: {trip.dispatch_note}"
                notify(
                    user=new_driver.user,
                    title="New Trip Assigned",
                    message=new_drv_msg,
                    type=Notification.NotificationType.TRIP,
                    item_type="trip",
                    item_id=trip.id,
                )

            # 3. Customer (if booking)
            if trip.booking and trip.booking.customer:
                notify(
                    user=trip.booking.customer,
                    title="Trip Assignment Updated",
                    message=f"Your trip #{trip.id} details have been updated: Driver {new_driver.user.full_name}, Vehicle {new_vehicle.registration_number} ({new_vehicle.brand} {new_vehicle.model}).",
                    type=Notification.NotificationType.TRIP,
                    item_type="booking",
                    item_id=trip.booking.id,
                )

        return Response(TripSerializer(trip).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Trips"],
        summary="Dispatch center summary",
        description="Summary KPIs for Dispatch Center: waiting, ready now, past dates, scheduled today, free drivers, free vehicles.",
    )
    @action(detail=False, methods=["get"], url_path="dispatch-summary")
    def dispatch_summary(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can query dispatch summary."},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        today = timezone.localdate()
        date_filter = request.query_params.get("date_filter", "ALL").upper()

        if date_filter == "TODAY":
            f_start = today
            f_end = today
        elif date_filter == "TOMORROW":
            f_start = today + timedelta(days=1)
            f_end = today + timedelta(days=1)
        elif date_filter == "THIS_WEEK":
            f_start = today
            f_end = today + timedelta(days=(6 - today.weekday()))
        elif date_filter and date_filter != "ALL":
            try:
                parsed_d = datetime.strptime(date_filter, "%Y-%m-%d").date()
                f_start = parsed_d
                f_end = parsed_d
            except ValueError:
                f_start = None
                f_end = None
        else:
            f_start = None
            f_end = None

        # 1. Waiting bookings (APPROVED and no active/scheduled trip)
        assigned_booking_ids = set(
            Trip.objects.filter(
                status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS]
            ).exclude(booking__isnull=True).values_list("booking_id", flat=True)
        )
        base_approved_bkg = Booking.objects.filter(
            status=Booking.Status.APPROVED
        ).exclude(id__in=assigned_booking_ids).select_related("customer")

        if f_start and f_end:
            approved_bookings = list(base_approved_bkg.filter(travel_datetime__date__range=(f_start, f_end)))
        else:
            approved_bookings = list(base_approved_bkg)

        waiting_count = len(approved_bookings)
        past_dates_count = sum(1 for b in approved_bookings if b.travel_datetime and b.travel_datetime.date() < today)

        # 2. Scheduled today
        scheduled_today_count = Trip.objects.filter(
            status=Trip.Status.SCHEDULED,
            scheduled_datetime__date=today,
        ).count()

        # 3. Free drivers now (ACTIVE, valid license, not on IN_PROGRESS trip right now)
        busy_driver_ids = set(
            Trip.objects.filter(
                status=Trip.Status.IN_PROGRESS
            ).values_list("driver_id", flat=True)
        )
        free_drivers_count = Driver.objects.filter(
            status=Driver.Status.ACTIVE,
            license_expiry__gte=today,
        ).exclude(id__in=busy_driver_ids).count()

        # 4. Free vehicles now (ACTIVE, not in maintenance today, not on IN_PROGRESS trip right now)
        busy_vehicle_ids = set(
            Trip.objects.filter(
                status=Trip.Status.IN_PROGRESS
            ).values_list("vehicle_id", flat=True)
        )
        maint_vehicle_ids = set(
            Maintenance.objects.filter(
                status__in=[Maintenance.Status.SCHEDULED, Maintenance.Status.IN_PROGRESS],
                scheduled_date__lte=today,
            ).values_list("vehicle_id", flat=True)
        )
        free_vehicles_count = Vehicle.objects.filter(
            status=Vehicle.Status.ACTIVE,
        ).exclude(id__in=busy_vehicle_ids | maint_vehicle_ids).count()

        # 5. Ready now (waiting items that have vehicle and driver ready)
        ready_now_count = max(0, waiting_count - past_dates_count) if (free_drivers_count > 0 and free_vehicles_count > 0) else 0

        # Summary statistics for Trip Assignments dashboard
        total_assignments = Trip.objects.count()
        assigned_bus_ids = set(
            Trip.objects.filter(
                status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS]
            ).exclude(bus_schedule__isnull=True).values_list("bus_schedule_id", flat=True)
        )
        waiting_bus_count = BusSchedule.objects.filter(
            status=BusSchedule.Status.CONFIRMED
        ).exclude(id__in=assigned_bus_ids).count()
        pending_assignments = waiting_count + waiting_bus_count
        assigned_trips = Trip.objects.filter(
            status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS]
        ).count()
        completed_assignments = Trip.objects.filter(status=Trip.Status.COMPLETED).count()

        return Response({
            "total_assignments": total_assignments,
            "pending_assignments": pending_assignments,
            "assigned_trips": assigned_trips,
            "completed_assignments": completed_assignments,
            "waiting": waiting_count,
            "ready_now": ready_now_count,
            "past_dates": past_dates_count,
            "scheduled_today": scheduled_today_count,
            "free_drivers_now": free_drivers_count,
            "free_vehicles_now": free_vehicles_count,
        })

    @extend_schema(
        tags=["Trips"],
        summary="Trip history",
        description="View completed and cancelled trips. Drivers see own; Admin/Managers see all.",
        responses={200: TripSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="history")
    def history(self, request):
        qs = self.get_queryset().filter(status__in=[Trip.Status.COMPLETED, Trip.Status.CANCELLED])
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(TripSerializer(page, many=True).data)
        return Response(TripSerializer(qs, many=True).data)

    @extend_schema(
        tags=["Trips"],
        summary="Trips overall summary",
        description="Overall trip metrics for dashboard (Admin/Manager only).",
        responses={200: TripSummarySerializer},
    )
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can view overall trip summary."},
                status=status.HTTP_403_FORBIDDEN,
            )

        all_trips = Trip.objects.all()
        data = {
            "total_trips": all_trips.count(),
            "active_trips": all_trips.filter(status=Trip.Status.IN_PROGRESS).count(),
            "scheduled_trips": all_trips.filter(status=Trip.Status.SCHEDULED).count(),
            "completed_trips": all_trips.filter(status=Trip.Status.COMPLETED).count(),
            "cancelled_trips": all_trips.filter(status=Trip.Status.CANCELLED).count(),
        }
        return Response(data)

    @extend_schema(
        tags=["Trips"],
        summary="Driver dashboard summary",
        description="Today's trips, upcoming trip, and completed counts for the logged-in driver.",
        responses={200: DriverTripSummarySerializer},
    )
    @action(detail=False, methods=["get"], url_path="driver-summary")
    def driver_summary(self, request):
        if request.user.role != User.Role.DRIVER:
            return Response(
                {"detail": "Only drivers can view driver summary."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            driver = request.user.driver_profile
        except Driver.DoesNotExist:
            return Response(
                {"detail": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.now().date()
        driver_trips = Trip.objects.filter(driver=driver)

        todays_count = driver_trips.filter(scheduled_datetime__date=today).count()
        completed_count = driver_trips.filter(status=Trip.Status.COMPLETED).count()
        upcoming_qs = driver_trips.filter(status=Trip.Status.SCHEDULED).order_by("scheduled_datetime")
        upcoming_count = upcoming_qs.count()
        upcoming_trip = upcoming_qs.first()

        data = {
            "todays_trips_count": todays_count,
            "upcoming_trips_count": upcoming_count,
            "completed_trips_count": completed_count,
            "upcoming_trip": TripSerializer(upcoming_trip).data if upcoming_trip else None,
        }
        return Response(data)
