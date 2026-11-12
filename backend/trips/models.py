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
        EXPIRED = "EXPIRED", "Expired"

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
    dispatch_note = models.CharField(
        max_length=300,
        blank=True,
        default="",
    )
    unstarted_notified = models.BooleanField(
        default=False,
    )
    # Geo places & routing fields
    pickup_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    pickup_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    drop_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    drop_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    route_geojson = models.JSONField(null=True, blank=True)
    route_distance_km = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    route_duration_min = models.PositiveIntegerField(null=True, blank=True)
    geo_status = models.CharField(
        max_length=20,
        choices=[
            ("OK", "OK"),
            ("APPROXIMATE", "Approximate"),
            ("FAILED", "Failed"),
            ("MANUAL", "Manual"),
        ],
        default="APPROXIMATE",
    )
    route_source = models.CharField(
        max_length=20,
        choices=[
            ("OSRM", "OSRM"),
            ("STRAIGHT", "Straight"),
        ],
        default="STRAIGHT",
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
    speed_kmh = models.FloatField(null=True, blank=True)
    heading = models.FloatField(null=True, blank=True)
    accuracy_m = models.FloatField(null=True, blank=True)
    is_simulated = models.BooleanField(default=False)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]
        verbose_name = "Trip Location"
        verbose_name_plural = "Trip Locations"

    def __str__(self):
        return f"Trip #{self.trip_id} Location ({self.latitude}, {self.longitude}) at {self.recorded_at}"


class GeoCache(models.Model):
    """Cached geocoding results for location search queries (cached for 90 days)."""

    query_text = models.CharField(max_length=500, unique=True, db_index=True)
    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)
    display_name = models.CharField(max_length=500, blank=True)
    provider = models.CharField(max_length=50, default="nominatim")
    fetched_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-fetched_at"]
        verbose_name = "Geo Cache"
        verbose_name_plural = "Geo Caches"

    def __str__(self):
        return f"{self.query_text} -> ({self.lat}, {self.lng})"


class TripAssignmentLog(models.Model):
    """Log of trip assignments, reassignments, and cancellations."""

    class Action(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        REASSIGNED = "REASSIGNED", "Reassigned"
        CANCELLED = "CANCELLED", "Cancelled"

    trip = models.ForeignKey(
        Trip,
        on_delete=models.CASCADE,
        related_name="assignment_logs",
    )
    action = models.CharField(
        max_length=20,
        choices=Action.choices,
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="performed_trip_logs",
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    old_vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    new_vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    old_driver = models.ForeignKey(
        Driver,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    new_driver = models.ForeignKey(
        Driver,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    reason = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Trip Assignment Log"
        verbose_name_plural = "Trip Assignment Logs"

    def __str__(self):
        return f"{self.action} on Trip #{self.trip_id} at {self.timestamp}"

