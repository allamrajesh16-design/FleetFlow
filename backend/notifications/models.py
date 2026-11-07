from django.conf import settings
from django.db import models


class Notification(models.Model):
    """Notification model for user alerts."""

    class NotificationType(models.TextChoices):
        BOOKING = "BOOKING", "Booking"
        TRIP = "TRIP", "Trip"
        PAYMENT = "PAYMENT", "Payment"
        VEHICLE = "VEHICLE", "Vehicle"
        DOCUMENT = "DOCUMENT", "Document"
        SYSTEM = "SYSTEM", "System"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        default=NotificationType.SYSTEM,
    )
    item_type = models.CharField(max_length=50, null=True, blank=True)
    item_id = models.CharField(max_length=50, null=True, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"

    def __str__(self):
        return f"{self.user.email} - {self.title} ({self.type})"


def notify(user, title, message, type=Notification.NotificationType.SYSTEM, item_type=None, item_id=None):
    """Helper function to create a notification for a user."""
    return Notification.objects.create(
        user=user,
        title=title,
        message=message,
        type=type,
        item_type=str(item_type).lower() if item_type is not None else None,
        item_id=str(item_id) if item_id is not None else None,
    )
