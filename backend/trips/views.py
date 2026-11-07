from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from django.conf import settings
from accounts.models import User
from bookings.models import Booking, BusSchedule
from documents.models import Document
from drivers.models import Driver
from notifications.models import Notification, notify
from vehicles.models import Vehicle, Maintenance

from .assignment_rules import trip_time_window, is_vehicle_free, is_driver_free
from .filters import TripFilter
from .models import Trip, TripLocation
from .permissions import TripPermission
from .serializers import (
    DriverTripSummarySerializer,
    TripAssignSerializer,
    TripCompleteSerializer,
    TripLocationSerializer,
    TripLocationUpdateSerializer,
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
                "vehicle_type": booking.vehicle_type,
                "source": booking.pickup_location,
                "destination": booking.drop_location,
                "scheduled_datetime": booking.travel_datetime.isoformat() if booking.travel_datetime else None,
                "passengers": booking.passengers,
                "estimated_fare": str(booking.estimated_fare) if booking.estimated_fare is not None else None,
                "distance_km": float(distance_km) if distance_km is not None else None,
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
            stats_data = get_trip_assignment_stats()
            return Response({
                "stats": stats_data,
                "detail": "Pass ?booking=<id> or ?bus_schedule=<id> to check target availability.",
                "vehicles": [],
                "drivers": [],
            })

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

                vehicles_result.append({
                    "id": v.id,
                    "registration_number": v.registration_number,
                    "brand": v.brand,
                    "model": v.model,
                    "vehicle_type": v.vehicle_type,
                    "seating_capacity": v.seating_capacity,
                    "rate_per_km": str(v.rate_per_km) if getattr(v, "rate_per_km", None) else None,
                    "available": is_free,
                    "reason": reason,
                    "next_free_time": next_free,
                })

        # Evaluate Drivers
        all_drivers = Driver.objects.all().select_related("user").order_by("user__full_name")
        drivers_result = []
        for d in all_drivers:
            is_free, reason = is_driver_free(d, start_dt, end_dt, driver_trips=driver_trips)
            if is_free or include_unavailable:
                last_trip_info = driver_last_trip.get(d.id, "No prior trips")

                drivers_result.append({
                    "id": d.id,
                    "name": d.user.full_name if d.user else "Driver",
                    "license_number": d.license_number,
                    "license_expiry": d.license_expiry.isoformat() if d.license_expiry else None,
                    "available": is_free,
                    "reason": reason,
                    "last_trip": last_trip_info,
                })

        return Response({
            "stats": get_trip_assignment_stats(),
            "target": target_summary,
            "window": {
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat(),
            },
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

            trip = Trip.objects.create(
                booking=booking,
                bus_schedule=bus_schedule,
                vehicle=vehicle,
                driver=driver,
                source=source,
                destination=destination,
                scheduled_datetime=scheduled_datetime,
                assigned_by=request.user,
                status=Trip.Status.SCHEDULED,
            )

            # If vehicle booking, attach vehicle to booking
            if booking:
                booking.vehicle = vehicle
                booking.save(update_fields=["vehicle"])

            # Notify the driver
            notify(
                user=driver.user,
                title="New Trip Assigned",
                message=(
                    f"You have been assigned trip #{trip.id} ({trip.source} to {trip.destination}) "
                    f"scheduled for {trip.scheduled_datetime.strftime('%Y-%m-%d %H:%M')}."
                ),
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

        qs = (
            Trip.objects.filter(driver__user=request.user)
            .select_related("vehicle", "driver", "driver__user", "booking", "bus_schedule")
            .prefetch_related("locations")
        )

        status_param = request.query_params.get("status")
        if status_param:
            normalized = status_param.upper().replace("-", "_")
            if normalized in ["UPCOMING", "SCHEDULED"]:
                qs = qs.filter(status=Trip.Status.SCHEDULED)
            elif normalized in ["IN_PROGRESS", "INPROGRESS"]:
                qs = qs.filter(status=Trip.Status.IN_PROGRESS)
            elif normalized in ["COMPLETED"]:
                qs = qs.filter(status=Trip.Status.COMPLETED)
            elif normalized in ["CANCELLED"]:
                qs = qs.filter(status=Trip.Status.CANCELLED)

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(TripSerializer(page, many=True).data)

        return Response(TripSerializer(qs, many=True).data)

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

        serializer = TripStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        start_odo = serializer.validated_data["start_odometer"]

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

        with transaction.atomic():
            loc = TripLocation.objects.create(trip=trip, latitude=lat, longitude=lon)

            # Keep only the last 200 points per trip
            keep_ids = list(
                TripLocation.objects.filter(trip=trip)
                .order_by("-recorded_at")
                .values_list("id", flat=True)[:200]
            )
            TripLocation.objects.filter(trip=trip).exclude(id__in=keep_ids).delete()

        return Response(TripLocationSerializer(loc).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=["Trips"],
        summary="Complete trip",
        description="Driver completes trip by submitting ending odometer reading. Calculates fare.",
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
        end_odo = serializer.validated_data["end_odometer"]

        if trip.start_odometer is not None and end_odo <= trip.start_odometer:
            return Response(
                {
                    "end_odometer": (
                        f"end_odometer ({end_odo}) must be strictly greater than start_odometer ({trip.start_odometer})."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        distance = end_odo - (trip.start_odometer or 0)

        with transaction.atomic():
            # Fare calculation
            if trip.booking:
                total_fare = Decimal(str(distance)) * trip.vehicle.rate_per_km
            elif trip.bus_schedule:
                active_bookings = trip.bus_schedule.bookings.exclude(
                    status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
                )
                total_fare = sum(
                    (b.estimated_fare for b in active_bookings), Decimal("0.00")
                )
            else:
                total_fare = Decimal("0.00")

            trip.status = Trip.Status.COMPLETED
            trip.completed_at = timezone.now()
            trip.end_odometer = end_odo
            trip.total_fare = total_fare
            trip.save(update_fields=["status", "completed_at", "end_odometer", "total_fare", "updated_at"])

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
            create_trip_payments(trip)

        return Response(TripSerializer(trip).data)

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
