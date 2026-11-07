from decimal import Decimal
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.upload_security import (
    private_file_storage,
    random_fuel_receipt_path,
    validate_private_document_file,
)
from drivers.models import Driver
from trips.models import Trip
from vehicles.models import Vehicle


class FuelLog(models.Model):
    """Model tracking vehicle fueling events, costs, and mileage."""

    class FuelType(models.TextChoices):
        PETROL = "PETROL", "Petrol"
        DIESEL = "DIESEL", "Diesel"
        CNG = "CNG", "CNG"
        ELECTRIC = "ELECTRIC", "Electric"

    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name="fuel_logs",
    )
    trip = models.ForeignKey(
        Trip,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fuel_logs",
    )
    driver = models.ForeignKey(
        Driver,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fuel_logs",
    )
    date = models.DateField()
    fuel_type = models.CharField(
        max_length=20,
        choices=FuelType.choices,
    )
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Liters for fuel, or kWh for electric vehicles",
    )
    price_per_unit = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )
    total_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        editable=False,
    )
    odometer_km = models.PositiveIntegerField()
    is_full_tank = models.BooleanField(default=False)
    station_name = models.CharField(max_length=255, blank=True, default="")
    receipt_image = models.FileField(
        upload_to=random_fuel_receipt_path,
        storage=private_file_storage,
        null=True,
        blank=True,
        validators=[validate_private_document_file],
    )
    class ReviewStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    review_status = models.CharField(
        max_length=20,
        choices=ReviewStatus.choices,
        default=ReviewStatus.PENDING,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_fuel_logs",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_fuel_logs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name = "Fuel Log"
        verbose_name_plural = "Fuel Logs"

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.fuel_type} ({self.date})"

    def clean(self):
        super().clean()
        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError({"quantity": "Quantity must be greater than zero."})
        if self.price_per_unit is not None and self.price_per_unit <= 0:
            raise ValidationError({"price_per_unit": "Price per unit must be greater than zero."})
        if self.date and self.date > timezone.localdate():
            raise ValidationError({"date": "Fuel log date cannot be in the future."})

        # Validate odometer against previous fuel log for same vehicle
        if self.vehicle_id and self.odometer_km is not None:
            last_log = (
                FuelLog.objects.filter(vehicle=self.vehicle)
                .exclude(pk=self.pk)
                .order_by("-odometer_km")
                .first()
            )
            if last_log and self.odometer_km < last_log.odometer_km:
                raise ValidationError({
                    "odometer_km": (
                        f"Odometer reading ({self.odometer_km} km) must be greater than or equal "
                        f"to the last recorded reading ({last_log.odometer_km} km)."
                    )
                })

    def save(self, *args, **kwargs):
        # Calculate total cost on the server = quantity * price_per_unit
        if self.quantity is not None and self.price_per_unit is not None:
            self.total_cost = round(
                Decimal(str(self.quantity)) * Decimal(str(self.price_per_unit)), 2
            )
        else:
            self.total_cost = Decimal("0.00")
        super().save(*args, **kwargs)

    @property
    def mileage_kmpl(self):
        """
        Compute km per liter (or km per unit) from the distance since
        the previous full-tank log divided by the liters of this fill.
        Returns None if not full tank or no previous full tank exists.
        """
        if not self.is_full_tank:
            return None

        prev_full_tank = (
            FuelLog.objects.filter(
                vehicle=self.vehicle,
                is_full_tank=True,
                odometer_km__lt=self.odometer_km,
            )
            .exclude(pk=self.pk)
            .order_by("-odometer_km")
            .first()
        )

        if prev_full_tank and self.quantity and self.quantity > 0:
            distance = self.odometer_km - prev_full_tank.odometer_km
            if distance > 0:
                return round(float(distance) / float(self.quantity), 2)

        return None
