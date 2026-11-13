from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from documents.models import AlertLog, Document
from drivers.models import Driver
from notifications.models import Notification, notify


def get_active_threshold(days_left):
    """
    Maps days_left to the most relevant alert threshold:
    - days_left <= 0 -> 0 (EXPIRED)
    - 0 < days_left <= 1 -> 1
    - 1 < days_left <= 7 -> 7
    - 7 < days_left <= 15 -> 15
    - 15 < days_left <= 30 -> 30
    - Otherwise -> None
    """
    if days_left <= 0:
        return 0
    elif days_left <= 1:
        return 1
    elif days_left <= 7:
        return 7
    elif days_left <= 15:
        return 15
    elif days_left <= 30:
        return 30
    return None


class Command(BaseCommand):
    help = (
        "Evaluates document and driver license expiry dates against 30, 15, 7, 1 days and expired thresholds. "
        "Sends in-app notifications to Admins, Fleet Managers, and Drivers without sending duplicates."
    )

    def handle(self, *args, **options):
        today = timezone.localdate()
        admins_and_managers = list(
            User.objects.filter(
                role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER],
                is_active=True,
            )
        )

        alerts_sent = 0

        # 1. Evaluate compliance documents
        documents = Document.objects.select_related("vehicle", "driver", "driver__user").all()
        for doc in documents:
            days_left = doc.days_left
            threshold = get_active_threshold(days_left)
            if threshold is None:
                continue

            # Idempotency check: never send the same alert for the same document and threshold
            if AlertLog.objects.filter(document=doc, threshold_days=threshold).exists():
                continue

            entity_name = (
                f"Vehicle {doc.vehicle.registration_number}"
                if doc.vehicle
                else (f"Driver {doc.driver.user.full_name}" if doc.driver and doc.driver.user else "Driver")
            )

            if threshold == 0:
                title = f"Document Expired: {doc.get_doc_type_display()}"
                message = (
                    f"Document '{doc.get_doc_type_display()}' (#{doc.document_number}) for {entity_name} "
                    f"expired on {doc.expiry_date}."
                )
            else:
                title = f"Document Expiring Soon ({threshold}d): {doc.get_doc_type_display()}"
                message = (
                    f"Document '{doc.get_doc_type_display()}' (#{doc.document_number}) for {entity_name} "
                    f"expires in {days_left} day(s) on {doc.expiry_date}."
                )

            with transaction.atomic():
                # get_or_create is race-condition-safe: if another process already
                # inserted this row (concurrent cron runs), created=False and we skip.
                alert_log, alert_created = AlertLog.objects.get_or_create(
                    document=doc,
                    threshold_days=threshold,
                    alert_type="DOCUMENT",
                )
                if not alert_created:
                    continue

                # In-app notifications to Admins and Fleet Managers
                for user in admins_and_managers:
                    notify(
                        user=user,
                        title=title,
                        message=message,
                        type=Notification.NotificationType.DOCUMENT,
                    )
                    alerts_sent += 1

                # If it's a driver document, notify that specific driver as well
                if doc.driver and doc.driver.user:
                    notify(
                        user=doc.driver.user,
                        title=title,
                        message=message,
                        type=Notification.NotificationType.DOCUMENT,
                    )
                    alerts_sent += 1

        # 2. Evaluate driver licenses from Driver model
        drivers = Driver.objects.select_related("user").all()
        for driver in drivers:
            days_left = (driver.license_expiry - today).days
            threshold = get_active_threshold(days_left)
            if threshold is None:
                continue

            if AlertLog.objects.filter(driver=driver, threshold_days=threshold).exists():
                continue

            driver_name = driver.user.full_name if driver.user else f"Driver #{driver.id}"

            if threshold == 0:
                title = f"Driver License Expired: {driver_name}"
                message = (
                    f"Driver license ({driver.license_number}) for {driver_name} "
                    f"expired on {driver.license_expiry}."
                )
            else:
                title = f"Driver License Expiring Soon ({threshold}d): {driver_name}"
                message = (
                    f"Driver license ({driver.license_number}) for {driver_name} "
                    f"expires in {days_left} day(s) on {driver.license_expiry}."
                )

            with transaction.atomic():
                # get_or_create is race-condition-safe: skip if already created
                # by a concurrent or repeated run of this management command.
                license_log, license_created = AlertLog.objects.get_or_create(
                    driver=driver,
                    threshold_days=threshold,
                    alert_type="DRIVER_LICENSE",
                )
                if not license_created:
                    continue

                for user in admins_and_managers:
                    notify(
                        user=user,
                        title=title,
                        message=message,
                        type=Notification.NotificationType.DOCUMENT,
                    )
                    alerts_sent += 1

                if driver.user:
                    notify(
                        user=driver.user,
                        title=title,
                        message=message,
                        type=Notification.NotificationType.DOCUMENT,
                    )
                    alerts_sent += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully checked document expiries. Total notification items dispatched: {alerts_sent}."
            )
        )
