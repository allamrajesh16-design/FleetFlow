from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.upload_security import (
    private_file_storage,
    random_document_path,
    validate_private_document_file,
)
from drivers.models import Driver
from vehicles.models import Vehicle


class Document(models.Model):
    """Model tracking compliance documents for fleet vehicles and drivers."""

    class DocType(models.TextChoices):
        # Vehicle document types
        INSURANCE = "INSURANCE", "Insurance"
        REGISTRATION_RC = "REGISTRATION_RC", "Registration (RC)"
        POLLUTION_PUC = "POLLUTION_PUC", "Pollution Under Control (PUC)"
        FITNESS = "FITNESS", "Fitness Certificate"
        ROAD_TAX = "ROAD_TAX", "Road Tax"
        PERMIT = "PERMIT", "Permit"
        # Driver document types
        DRIVING_LICENSE = "DRIVING_LICENSE", "Driving License"
        ID_PROOF = "ID_PROOF", "ID Proof"
        PROFILE_PHOTO = "PROFILE_PHOTO", "Driver Profile Photo"
        POLICE_VERIFICATION = "POLICE_VERIFICATION", "Police Verification Certificate"
        MEDICAL_CERTIFICATE = "MEDICAL_CERTIFICATE", "Medical Certificate"
        # General / Other
        OTHER = "OTHER", "Other"

    VEHICLE_DOC_TYPES = [
        DocType.INSURANCE,
        DocType.REGISTRATION_RC,
        DocType.POLLUTION_PUC,
        DocType.FITNESS,
        DocType.ROAD_TAX,
        DocType.PERMIT,
        DocType.OTHER,
    ]

    DRIVER_DOC_TYPES = [
        DocType.DRIVING_LICENSE,
        DocType.ID_PROOF,
        DocType.PROFILE_PHOTO,
        DocType.POLICE_VERIFICATION,
        DocType.MEDICAL_CERTIFICATE,
        DocType.OTHER,
    ]

    class ExpiryStatus(models.TextChoices):
        VALID = "VALID", "Valid"
        EXPIRING_SOON = "EXPIRING_SOON", "Expiring Soon"
        EXPIRED = "EXPIRED", "Expired"

    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    driver = models.ForeignKey(
        Driver,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    doc_type = models.CharField(
        max_length=40,
        choices=DocType.choices,
    )
    document_number = models.CharField(max_length=100, blank=True, default="")
    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    file = models.FileField(
        upload_to=random_document_path,
        storage=private_file_storage,
        validators=[validate_private_document_file],
    )
    notes = models.TextField(blank=True, default="")
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
        related_name="reviewed_documents",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_documents",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["expiry_date", "-created_at"]
        verbose_name = "Document"
        verbose_name_plural = "Documents"
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(vehicle__isnull=False, driver__isnull=True)
                    | models.Q(vehicle__isnull=True, driver__isnull=False)
                ),
                name="document_vehicle_xor_driver",
            )
        ]

    def __str__(self):
        target = self.vehicle.registration_number if self.vehicle else (
            self.driver.user.full_name if self.driver and self.driver.user else "Driver"
        )
        return f"{self.doc_type} - {target} (Expires: {self.expiry_date})"

    @property
    def days_left(self):
        """Number of days until document expiry. Negative means expired."""
        if not self.expiry_date:
            return None
        return (self.expiry_date - timezone.localdate()).days

    @property
    def expiry_status(self):
        """Computed status: VALID, EXPIRING_SOON (<= 30 days), or EXPIRED."""
        if not self.expiry_date:
            return self.ExpiryStatus.VALID
        days = self.days_left
        if days is not None and days < 0:
            return self.ExpiryStatus.EXPIRED
        elif days is not None and days <= 30:
            return self.ExpiryStatus.EXPIRING_SOON
        return self.ExpiryStatus.VALID

    def clean(self):
        super().clean()
        has_v = bool(self.vehicle_id or self.vehicle)
        has_d = bool(self.driver_id or self.driver)

        if has_v == has_d:
            raise ValidationError(
                "Document must be associated with either a Vehicle or a Driver, but not both and not neither."
            )

        if has_v and self.doc_type not in self.VEHICLE_DOC_TYPES:
            raise ValidationError({
                "doc_type": f"Invalid doc_type '{self.doc_type}' for a vehicle."
            })

        if has_d and self.doc_type not in self.DRIVER_DOC_TYPES:
            raise ValidationError({
                "doc_type": f"Invalid doc_type '{self.doc_type}' for a driver."
            })

        if self.doc_type != self.DocType.PROFILE_PHOTO and not self.expiry_date:
            raise ValidationError({
                "expiry_date": "Expiry date is required for this document type."
            })

        if self.doc_type != self.DocType.PROFILE_PHOTO and not self.document_number:
            raise ValidationError({
                "document_number": "Document number is required for this document type."
            })

        if self.issue_date and self.expiry_date and self.issue_date > self.expiry_date:
            raise ValidationError({
                "issue_date": "Issue date cannot be later than expiry date."
            })


class AlertLog(models.Model):
    """Tracks sent expiry alert notifications to guarantee idempotency (never duplicate alerts)."""

    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="alert_logs",
    )
    driver = models.ForeignKey(
        Driver,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="license_alert_logs",
    )
    threshold_days = models.IntegerField(
        help_text="Days remaining threshold (e.g. 30, 15, 7, 1, 0 for expired)",
    )
    alert_type = models.CharField(max_length=30, default="DOCUMENT")
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Alert Log"
        verbose_name_plural = "Alert Logs"
        constraints = [
            models.UniqueConstraint(
                fields=["document", "threshold_days"],
                name="unique_doc_threshold_alert",
                condition=models.Q(document__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["driver", "threshold_days"],
                name="unique_driver_license_threshold_alert",
                condition=models.Q(driver__isnull=False),
            ),
        ]

    def __str__(self):
        target = self.document or self.driver
        return f"Alert for {target} at {self.threshold_days} days threshold ({self.sent_at})"
