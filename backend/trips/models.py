from django.conf import settings
from django.db import models
from bookings.models import Booking, BusSchedule
from drivers.models import Driver
from vehicles.models import Vehicle


class Trip(models.Model):
    """Trip model tracking scheduled trips, driver assignments, and odometer readings."""

    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    booking = models.ForeignKey(
        Booking,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="trips",
    )
    bus_schedule = models.ForeignKey(
        BusSchedule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="trips",
    )
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name="trips",
    )
    driver = models.ForeignKey(
        Driver,
        on_delete=models.CASCADE,
        related_name="trips",
    )
    source = models.CharField(max_length=255)
    destination = models.CharField(max_length=255)
    scheduled_datetime = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )
    start_odometer = models.PositiveIntegerField(null=True, blank=True)
    end_odometer = models.PositiveIntegerField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    total_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_trips",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Trip"
        verbose_name_plural = "Trips"

    @property
    def distance_km(self):
        if self.end_odometer is not None and self.start_odometer is not None:
            return max(0, self.end_odometer - self.start_odometer)
        return None

    def __str__(self):
        return f"Trip #{self.id} [{self.status}]: {self.source} -> {self.destination} ({self.vehicle.registration_number})"


class TripLocation(models.Model):
    """Live location ping for an in-progress trip."""

    trip = models.ForeignKey(
        Trip,
        on_delete=models.CASCADE,
        related_name="locations",
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]
        verbose_name = "Trip Location"
        verbose_name_plural = "Trip Locations"

    def __str__(self):
        return f"Trip #{self.trip_id} Location ({self.latitude}, {self.longitude}) at {self.recorded_at}"
