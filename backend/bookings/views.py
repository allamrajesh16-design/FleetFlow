from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Q, Value, IntegerField
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from accounts.models import User
from notifications.models import Notification, notify
from vehicles.models import Vehicle

from .filters import BookingFilter, BusScheduleFilter
from .models import Booking, BusSchedule
from .permissions import BookingPermission, BusSchedulePermission
from .serializers import (
    BookingApproveSerializer,
    BookingBusResponseSerializer,
    BookingCancelSerializer,
    BookingRejectSerializer,
    BookingSerializer,
    BookingTrackingSerializer,
    BusScheduleSerializer,
)


@extend_schema_view(
    list=extend_schema(
        tags=["Bus Schedules"],
        summary="List bus schedules",
        description="List bus schedules. Customers see OPEN or CONFIRMED future schedules. Staff see all.",
    ),
    create=extend_schema(
        tags=["Bus Schedules"],
        summary="Create bus schedule",
        description="Add a new bus schedule (Admin and Fleet Manager only).",
    ),
    retrieve=extend_schema(
        tags=["Bus Schedules"],
        summary="Retrieve bus schedule",
        description="Get detailed information about a bus schedule.",
    ),
    update=extend_schema(
        tags=["Bus Schedules"],
        summary="Update bus schedule",
        description="Update a bus schedule (Admin and Fleet Manager only).",
    ),
    partial_update=extend_schema(
        tags=["Bus Schedules"],
        summary="Partial update bus schedule",
        description="Partially update a bus schedule (Admin and Fleet Manager only).",
    ),
    destroy=extend_schema(
        tags=["Bus Schedules"],
        summary="Delete bus schedule",
        description="Delete a bus schedule (Admin and Fleet Manager only).",
    ),
)
class BusScheduleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing bus schedules."""

    queryset = BusSchedule.objects.all()
    serializer_class = BusScheduleSerializer
    permission_classes = [BusSchedulePermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = BusScheduleFilter
    search_fields = ["source", "destination", "vehicle__registration_number"]
    ordering_fields = ["departure_datetime", "fare_per_seat", "created_at"]
    ordering = ["departure_datetime"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or user.role == User.Role.DRIVER:
            return BusSchedule.objects.none()

        # Real-time sync of expired schedules and unstarted scheduled trips
        try:
            from .services import sync_expired_bus_schedules
            sync_expired_bus_schedules()
        except Exception:
            pass

        qs = (
            BusSchedule.objects.all()
            .select_related("vehicle")
            .annotate(
                _annotated_booked_seats=Coalesce(
                    Sum(
                        "bookings__passengers",
                        filter=~Q(bookings__status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]),
                    ),
                    Value(0),
                    output_field=IntegerField(),
                )
            )
        )

        if user.role == User.Role.CUSTOMER:
            return qs.filter(
                status__in=[BusSchedule.Status.OPEN, BusSchedule.Status.CONFIRMED],
                departure_datetime__gt=timezone.now(),
            ).exclude(status=BusSchedule.Status.EXPIRED)

        return qs


@extend_schema_view(
    list=extend_schema(
        tags=["Bookings"],
        summary="List bookings",
        description="List bookings with filters and search. Customers see only their own. Staff see all.",
    ),
    create=extend_schema(
        tags=["Bookings"],
        summary="Create a booking",
        description="Create a vehicle or bus seat booking (Customer only).",
    ),
    retrieve=extend_schema(
        tags=["Bookings"],
        summary="Retrieve booking details",
        description="Get details of a specific booking.",
    ),
)
class BookingViewSet(viewsets.ModelViewSet):
    """ViewSet for managing bookings."""

    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [BookingPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = BookingFilter
    search_fields = [
        "customer__full_name",
        "customer__email",
        "pickup_location",
        "drop_location",
        "vehicle__registration_number",
        "bus_schedule__source",
        "bus_schedule__destination",
    ]
    ordering_fields = ["created_at", "travel_datetime", "estimated_fare"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or user.role == User.Role.DRIVER:
            return Booking.objects.none()

        if user.role == User.Role.CUSTOMER:
            return (
                Booking.objects.filter(customer=user)
                .select_related("customer", "vehicle", "bus_schedule")
                .prefetch_related("payments")
            )

        return (
            Booking.objects.all()
            .select_related("customer", "vehicle", "bus_schedule")
            .prefetch_related("payments")
        )

    @extend_schema(
        tags=["Bookings"],
        summary="Approve booking",
        description="Approve a pending VEHICLE booking (Admin and Fleet Manager only).",
        request=BookingApproveSerializer,
        responses={200: BookingSerializer},
    )
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        booking = self.get_object()

        if booking.booking_type != Booking.BookingType.VEHICLE:
            return Response(
                {"detail": "Only VEHICLE bookings require manual approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if booking.status != Booking.Status.PENDING:
            return Response(
                {"detail": f"Only PENDING bookings can be approved (currently {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = BookingApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vehicle_id = serializer.validated_data.get("vehicle_id")

        if vehicle_id:
            try:
                vehicle = Vehicle.objects.get(id=vehicle_id)
            except Vehicle.DoesNotExist:
                return Response(
                    {"detail": "Assigned vehicle not found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if vehicle.vehicle_type != booking.vehicle_type:
                return Response(
                    {"detail": f"Assigned vehicle must be of type {booking.vehicle_type}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if vehicle.status != Vehicle.Status.ACTIVE:
                return Response(
                    {"detail": "Assigned vehicle is not active."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            booking.vehicle = vehicle

            if booking.estimated_distance_km and (booking.estimated_fare is None or booking.estimated_fare == Decimal("0.00")):
                booking.estimated_fare = booking.estimated_distance_km * vehicle.rate_per_km

        booking.status = Booking.Status.APPROVED
        booking.save()

        # Notify customer
        notify(
            user=booking.customer,
            title="Booking Approved",
            message=f"Your {booking.vehicle_type} booking #{booking.id} has been approved.",
            type=Notification.NotificationType.BOOKING,
            item_type="booking",
            item_id=booking.id,
        )

        return Response(BookingSerializer(booking, context={"request": request}).data)

    @extend_schema(
        tags=["Bookings"],
        summary="Reject booking",
        description="Reject a pending booking with a reason (Admin and Fleet Manager only).",
        request=BookingRejectSerializer,
        responses={200: BookingSerializer},
    )
    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        booking = self.get_object()

        if booking.status != Booking.Status.PENDING:
            return Response(
                {"detail": f"Only PENDING bookings can be rejected (currently {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = BookingRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["rejection_reason"]

        booking.status = Booking.Status.REJECTED
        booking.rejection_reason = reason
        booking.save()

        # Notify customer
        notify(
            user=booking.customer,
            title="Booking Rejected",
            message=f"Your booking #{booking.id} was rejected. Reason: {reason}",
            type=Notification.NotificationType.BOOKING,
            item_type="booking",
            item_id=booking.id,
        )

        return Response(BookingSerializer(booking, context={"request": request}).data)

    @extend_schema(
        tags=["Bookings"],
        summary="Cancel booking",
        description="Cancel own booking before travel datetime (Customer only).",
        request=BookingCancelSerializer,
        responses={200: BookingSerializer},
    )
    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        booking = self.get_object()

        is_staff = request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER]

        if not is_staff and booking.customer_id != request.user.id:
            return Response(
                {"detail": "You do not have permission to cancel this booking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not is_staff and booking.travel_datetime <= timezone.now():
            return Response(
                {"detail": "Cannot cancel booking after travel datetime."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if booking.status == Booking.Status.CANCELLED:
            return Response(
                {"detail": "Booking is already cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if booking.status == Booking.Status.COMPLETED:
            return Response(
                {"detail": "Cannot cancel a completed booking."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = BookingCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cancel_reason = serializer.validated_data.get("cancel_reason", "Cancelled by customer")

        booking.status = Booking.Status.CANCELLED
        booking.cancel_reason = cancel_reason
        if booking.booking_type == Booking.BookingType.BUS_SEAT:
            booking.refund_status = Booking.RefundStatus.REFUND_PENDING
        booking.save()

        # Notify customer
        notify(
            user=booking.customer,
            title="Booking Cancelled",
            message=f"Your booking #{booking.id} has been cancelled successfully.",
            type=Notification.NotificationType.BOOKING,
            item_type="booking",
            item_id=booking.id,
        )

        # Notify managers and admins
        for staff in User.objects.filter(role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER]):
            notify(
                user=staff,
                title="Booking Cancelled by Customer",
                message=f"Booking #{booking.id} cancelled by {booking.customer.email}.",
                type=Notification.NotificationType.BOOKING,
                item_type="booking",
                item_id=booking.id,
            )

        return Response(BookingSerializer(booking, context={"request": request}).data)

    @extend_schema(
        tags=["Bookings"],
        summary="Respond to cancelled bus schedule",
        description="Choose alternative vehicle, cancellation, or refund when bus schedule was cancelled.",
        request=BookingBusResponseSerializer,
        responses={200: BookingSerializer},
    )
    @action(detail=True, methods=["post"], url_path="bus-response")
    def bus_response(self, request, pk=None):
        booking = self.get_object()

        if booking.customer_id != request.user.id:
            return Response(
                {"detail": "You do not have permission to respond to this booking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not booking.bus_schedule or booking.bus_schedule.status != BusSchedule.Status.CANCELLED:
            return Response(
                {"detail": "Bus response is only allowed when the bus schedule was cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = BookingBusResponseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        choice = serializer.validated_data["choice"]

        booking.bus_option_choice = choice
        if choice == Booking.BusOptionChoice.CANCEL:
            booking.status = Booking.Status.CANCELLED
        elif choice == Booking.BusOptionChoice.REFUND:
            booking.refund_status = Booking.RefundStatus.REFUND_PENDING

        booking.save()

        # Notify customer
        notify(
            user=booking.customer,
            title="Bus Option Choice Recorded",
            message=f"Your choice '{choice}' for cancelled bus booking #{booking.id} has been recorded.",
            type=Notification.NotificationType.BOOKING,
        )

        # Notify managers
        for staff in User.objects.filter(role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER]):
            notify(
                user=staff,
                title="Customer Selected Bus Option",
                message=f"Customer {booking.customer.email} selected '{choice}' for cancelled booking #{booking.id}.",
                type=Notification.NotificationType.BOOKING,
            )

        return Response(BookingSerializer(booking, context={"request": request}).data)

    @extend_schema(
        tags=["Bookings"],
        summary="Live trip tracking for booking",
        description="Retrieve real-time tracking information, status steps, driver/vehicle details, and GPS coordinates (customer owner only).",
        responses={200: BookingTrackingSerializer},
    )
    @action(detail=True, methods=["get"], url_path="tracking")
    def tracking(self, request, pk=None):
        booking = self.get_object()

        # Only the customer who owns the booking (a bus seat booking belongs to its customer too). Anyone else gets 403 or 404.
        if request.user.role != User.Role.CUSTOMER or booking.customer_id != request.user.id:
            return Response(
                {"detail": "You do not have permission to track this booking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Look up associated trip (for vehicle booking or bus schedule)
        trip = booking.trips.exclude(status="CANCELLED").order_by("-created_at").first()
        if not trip and booking.bus_schedule:
            trip = booking.bus_schedule.trips.exclude(status="CANCELLED").order_by("-created_at").first()
        if not trip:
            trip = booking.trips.order_by("-created_at").first()
        if not trip and booking.bus_schedule:
            trip = booking.bus_schedule.trips.order_by("-created_at").first()

        # Step calculation: BOOKED, ASSIGNED, IN_PROGRESS, COMPLETED
        if trip and trip.status == "COMPLETED":
            step = "COMPLETED"
        elif trip and trip.status == "IN_PROGRESS":
            step = "IN_PROGRESS"
        elif trip and trip.status == "SCHEDULED":
            step = "ASSIGNED"
        elif booking.status == Booking.Status.COMPLETED:
            step = "COMPLETED"
        else:
            step = "BOOKED"

        # Driver name and vehicle registration (no phone number and no email)
        driver_name = None
        if trip and trip.driver and trip.driver.user:
            driver_name = trip.driver.user.full_name

        vehicle_registration = None
        if trip and trip.vehicle:
            vehicle_registration = trip.vehicle.registration_number
        elif booking.vehicle:
            vehicle_registration = booking.vehicle.registration_number

        # Last known location: only while the trip is IN_PROGRESS
        last_known_location = None
        if trip and trip.status == "IN_PROGRESS":
            latest_loc = trip.locations.order_by("-recorded_at").first()
            if latest_loc:
                last_known_location = {
                    "latitude": latest_loc.latitude,
                    "longitude": latest_loc.longitude,
                    "recorded_at": latest_loc.recorded_at,
                }

        data = {
            "booking_id": booking.id,
            "booking_status": booking.status,
            "trip_status": trip.status if trip else None,
            "step": step,
            "source": trip.source if trip else booking.pickup_location,
            "destination": trip.destination if trip else booking.drop_location,
            "scheduled_datetime": trip.scheduled_datetime if trip else booking.travel_datetime,
            "driver_name": driver_name,
            "vehicle_registration": vehicle_registration,
            "last_known_location": last_known_location,
        }

        serializer = BookingTrackingSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)
