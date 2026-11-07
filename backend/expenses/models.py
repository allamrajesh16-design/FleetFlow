from decimal import Decimal
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.upload_security import (
    private_file_storage,
    random_expense_receipt_path,
    validate_private_document_file,
)
from trips.models import Trip
from vehicles.models import Vehicle


class Expense(models.Model):
    """Model tracking operating expenses across fleet vehicles and trips."""

    class Category(models.TextChoices):
        TOLL = "TOLL", "Toll"
        PARKING = "PARKING", "Parking"
        REPAIR = "REPAIR", "Repair"
        INSURANCE = "INSURANCE", "Insurance"
        PERMIT_TAX = "PERMIT_TAX", "Permit & Tax"
        FINE = "FINE", "Fine"
        DRIVER_ALLOWANCE = "DRIVER_ALLOWANCE", "Driver Allowance"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    category = models.CharField(
        max_length=30,
        choices=Category.choices,
    )
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    trip = models.ForeignKey(
        Trip,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )
    date = models.DateField()
    description = models.TextField()
    receipt_image = models.FileField(
        upload_to=random_expense_receipt_path,
        storage=private_file_storage,
        null=True,
        blank=True,
        validators=[validate_private_document_file],
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="submitted_expenses",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_expenses",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name = "Expense"
        verbose_name_plural = "Expenses"

    def __str__(self):
        veh = self.vehicle.registration_number if self.vehicle else "General"
        return f"{self.category} - {veh} - ₹{self.amount} ({self.status})"

    def clean(self):
        super().clean()
        if str(self.category).upper() == "FUEL":
            raise ValidationError({
                "category": "Fuel is not an expense category. Log fuel records through the Fuel Management system."
            })
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({"amount": "Expense amount must be greater than zero."})
        if self.date and self.date > timezone.localdate():
            raise ValidationError({"date": "Expense date cannot be in the future."})
