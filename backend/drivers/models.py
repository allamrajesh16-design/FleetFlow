from datetime import date
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Driver(models.Model):
    """Driver profile linked to a User with DRIVER role."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ON_TRIP = "ON_TRIP", "On Trip"
        INACTIVE = "INACTIVE", "Inactive"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="driver_profile",
    )
    license_number = models.CharField(max_length=50, unique=True, db_index=True)
    license_expiry = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Driver"
        verbose_name_plural = "Drivers"

    def clean(self):
        super().clean()
        if self.license_expiry and self.license_expiry < date.today():
            raise ValidationError({
                "license_expiry": "Driver license expiry date must not be in the past."
            })
        if self.user and self.user.role != "DRIVER":
            raise ValidationError({
                "user": "Associated user must have the DRIVER role."
            })

    def delete(self, *args, **kwargs):
        if self.status == self.Status.ON_TRIP:
            raise ValidationError("A driver with status ON_TRIP cannot be deleted.")
        return super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.user.full_name} ({self.license_number}) - {self.status}"
