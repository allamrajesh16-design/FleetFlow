from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone

from bookings.models import Booking
from core.upload_security import (
    random_payment_proof_path,
    random_qr_image_path,
    validate_image_file,
)
from trips.models import Trip


class Payment(models.Model):
    """Payment record tracking trip fares, QR tokens, and gateway transactions."""

    class Status(models.TextChoices):
        UNPAID = "UNPAID", "Unpaid"
        PAYMENT_INITIATED = "PAYMENT_INITIATED", "Payment Initiated"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"
        REFUNDED = "REFUNDED", "Refunded"

    class PaymentMethod(models.TextChoices):
        UPI = "UPI", "UPI"
        CARD = "CARD", "Card"
        WALLET = "WALLET", "Wallet"

    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    trip = models.ForeignKey(
        Trip,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.UNPAID,
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        null=True,
        blank=True,
    )
    qr_token = models.CharField(
        max_length=128,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    qr_expires_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    qr_used = models.BooleanField(
        default=False,
    )
    gateway_reference = models.CharField(
        max_length=100,
        null=True,
        blank=True,
    )
    transaction_reference = models.CharField(
        max_length=50,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    proof_screenshot = models.ImageField(
        upload_to=random_payment_proof_path,
        validators=[validate_image_file],
        null=True,
        blank=True,
    )
    failure_reason = models.TextField(
        null=True,
        blank=True,
    )
    paid_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    refunded_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Payment"
        verbose_name_plural = "Payments"

    def is_qr_valid(self):
        return (
            bool(self.qr_token)
            and not self.qr_used
            and self.qr_expires_at is not None
            and timezone.now() < self.qr_expires_at
        )

    def __str__(self):
        return f"Payment #{self.id} [Booking #{self.booking_id}] - Rs. {self.amount} ({self.status})"


class PaymentQRSetting(models.Model):
    """Admin-managed static QR setting for manual UPI payment collections."""

    title = models.CharField(
        max_length=150,
        default="FleetFlow Payment QR",
    )
    qr_image = models.ImageField(
        upload_to=random_qr_image_path,
        validators=[validate_image_file],
    )
    upi_id = models.CharField(
        max_length=100,
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(
        default=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_qr_settings",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "Payment QR Setting"
        verbose_name_plural = "Payment QR Settings"

    def save(self, *args, **kwargs):
        # Only one setting can be active at a time
        if self.is_active:
            PaymentQRSetting.objects.exclude(pk=self.pk).filter(is_active=True).update(is_active=False)
        super().save(*args, **kwargs)

    def __str__(self):
        status_label = "Active" if self.is_active else "Inactive"
        return f"{self.title} ({status_label})"


class Receipt(models.Model):
    """Immutable receipt generated upon successful payment."""

    payment = models.OneToOneField(
        Payment,
        on_delete=models.CASCADE,
        related_name="receipt",
    )
    receipt_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    data = models.JSONField(default=dict)

    class Meta:
        ordering = ["-issued_at"]
        verbose_name = "Receipt"
        verbose_name_plural = "Receipts"

    @classmethod
    def generate_receipt_number(cls, payment_id):
        year = timezone.now().year
        return f"FF-{year}-{payment_id:06d}"

    def __str__(self):
        return f"Receipt {self.receipt_number} for Payment #{self.payment_id}"

