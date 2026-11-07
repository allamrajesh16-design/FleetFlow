from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from vehicles.models import Vehicle


class BusSchedule(models.Model):
    """Bus trip schedule with fixed route and departure time."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CONFIRMED = "CONFIRMED", "Confirmed"
        CANCELLED = "CANCELLED", "Cancelled"

    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name="bus_schedules",
        limit_choices_to={"vehicle_type": Vehicle.VehicleType.BUS},
    )
    source = models.CharField(max_length=150)
    destination = models.CharField(max_length=150)
    departure_datetime = models.DateTimeField()
    fare_per_seat = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_bus_schedules",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["departure_datetime"]
        verbose_name = "Bus Schedule"
        verbose_name_plural = "Bus Schedules"

    def clean(self):
        super().clean()
        if self.vehicle_id and self.vehicle.vehicle_type != Vehicle.VehicleType.BUS:
            raise ValidationError({"vehicle": "Assigned vehicle must be of type BUS."})

    @property
    def total_seats(self) -> int:
        return self.vehicle.seating_capacity if self.vehicle else 0

    @property
    def booked_seats(self) -> int:
        if hasattr(self, "_annotated_booked_seats"):
            return self._annotated_booked_seats or 0
        active_bookings = self.bookings.exclude(
            status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
        )
        total = active_bookings.aggregate(total=models.Sum("passengers"))["total"]
        return total or 0

    @property
    def current_passengers(self) -> int:
        return self.booked_seats

    @property
    def available_seats(self) -> int:
        return max(0, self.total_seats - self.booked_seats)

    @property
    def min_passengers(self) -> int | None:
        if self.vehicle and self.vehicle.min_passengers is not None:
            return self.vehicle.min_passengers
        return None

    @property
    def booking_deadline(self):
        return self.departure_datetime - timedelta(hours=10)

    @property
    def is_booking_open(self) -> bool:
        return (
            self.status == self.Status.OPEN
            and timezone.now() < self.booking_deadline
            and self.available_seats > 0
        )

    def __str__(self):
        return f"BusSchedule #{self.id}: {self.source} -> {self.destination} at {self.departure_datetime} ({self.status})"


class Booking(models.Model):
    """Booking model for vehicle hire or bus seat reservation."""

    class BookingType(models.TextChoices):
        VEHICLE = "VEHICLE", "Vehicle"
        BUS_SEAT = "BUS_SEAT", "Bus Seat"

    class VehicleType(models.TextChoices):
        CAR = "CAR", "Car"
        BIKE = "BIKE", "Bike"
        BUS = "BUS", "Bus"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"
        COMPLETED = "COMPLETED", "Completed"

    class RefundStatus(models.TextChoices):
        NONE = "NONE", "None"
        REFUND_PENDING = "REFUND_PENDING", "Refund Pending"
        REFUNDED = "REFUNDED", "Refunded"

    class BusOptionChoice(models.TextChoices):
        ALTERNATIVE_VEHICLE = "ALTERNATIVE_VEHICLE", "Alternative Vehicle"
        CANCEL = "CANCEL", "Cancel"
        REFUND = "REFUND", "Refund"

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bookings",
    )
    booking_type = models.CharField(
        max_length=20,
        choices=BookingType.choices,
    )
    vehicle_type = models.CharField(
        max_length=10,
        choices=VehicleType.choices,
    )
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )
    bus_schedule = models.ForeignKey(
        BusSchedule,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="bookings",
    )
    pickup_location = models.CharField(max_length=255)
    drop_location = models.CharField(max_length=255)
    travel_datetime = models.DateTimeField()
    passengers = models.PositiveIntegerField(default=1)
    estimated_distance_km = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
    )
    estimated_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    final_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    rejection_reason = models.TextField(null=True, blank=True)
    cancel_reason = models.TextField(null=True, blank=True)
    refund_status = models.CharField(
        max_length=20,
        choices=RefundStatus.choices,
        default=RefundStatus.NONE,
    )
    bus_option_choice = models.CharField(
        max_length=30,
        choices=BusOptionChoice.choices,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Booking"
        verbose_name_plural = "Bookings"

    def clean(self):
        super().clean()
        if self.booking_type == self.BookingType.BUS_SEAT:
            if not self.bus_schedule_id:
                raise ValidationError({"bus_schedule": "bus_schedule is required for BUS_SEAT bookings."})
            if self.vehicle_type != self.VehicleType.BUS:
                raise ValidationError({"vehicle_type": "vehicle_type must be BUS for BUS_SEAT bookings."})
        elif self.booking_type == self.BookingType.VEHICLE:
            if self.vehicle_type not in [self.VehicleType.CAR, self.VehicleType.BIKE]:
                raise ValidationError({"vehicle_type": "vehicle_type for VEHICLE bookings must be CAR or BIKE."})

    def __str__(self):
        return f"Booking #{self.id} ({self.booking_type}) - {self.customer.email} [{self.status}]"
