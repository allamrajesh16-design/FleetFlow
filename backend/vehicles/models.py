from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class Vehicle(models.Model):
    """Vehicle model for fleet management."""

    class VehicleType(models.TextChoices):
        CAR = "CAR", "Car"
        BIKE = "BIKE", "Bike"
        BUS = "BUS", "Bus"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        ON_TRIP = "ON_TRIP", "On Trip"
        INACTIVE = "INACTIVE", "Inactive"

    registration_number = models.CharField(max_length=30, unique=True, db_index=True)
    vehicle_type = models.CharField(max_length=10, choices=VehicleType.choices)
    brand = models.CharField(max_length=60)
    model = models.CharField(max_length=60)
    seating_capacity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    min_passengers = models.PositiveIntegerField(null=True, blank=True)
    rate_per_km = models.DecimalField(max_digits=8, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Vehicle"
        verbose_name_plural = "Vehicles"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(seating_capacity__gte=1),
                name="vehicle_seating_capacity_gte_1",
            ),
        ]

    def clean(self):
        super().clean()
        if self.vehicle_type == self.VehicleType.BUS:
            if self.min_passengers is None or self.min_passengers < 1:
                raise ValidationError({
                    "min_passengers": "Bus min_passengers is required and must be at least 1."
                })
            if self.min_passengers >= self.seating_capacity:
                raise ValidationError({
                    "min_passengers": "Bus min_passengers must be strictly less than seating_capacity."
                })
        else:
            # If not a bus, min_passengers is not applicable
            if self.min_passengers is not None and self.min_passengers > 0:
                self.min_passengers = None

    def delete(self, *args, **kwargs):
        if self.status == self.Status.ON_TRIP:
            raise ValidationError("A vehicle with status ON_TRIP cannot be deleted.")
        return super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.registration_number} - {self.brand} {self.model} ({self.vehicle_type})"


from django.conf import settings


class Maintenance(models.Model):
    """Vehicle maintenance records."""

    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"

    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name="maintenance_records",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    scheduled_date = models.DateField()
    cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )
    alert_sent = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_maintenances",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-scheduled_date", "-created_at"]
        verbose_name = "Maintenance"
        verbose_name_plural = "Maintenance Records"

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.title} ({self.status})"

