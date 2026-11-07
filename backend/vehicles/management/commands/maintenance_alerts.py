from datetime import date, timedelta
from django.core.management.base import BaseCommand
from accounts.models import User
from notifications.models import Notification, notify
from vehicles.models import Maintenance


class Command(BaseCommand):
    help = "Alert Admin and Fleet Manager users for maintenance scheduled within the next 3 days."

    def handle(self, *args, **options):
        today = date.today()
        three_days_later = today + timedelta(days=3)

        upcoming_records = Maintenance.objects.filter(
            scheduled_date__gte=today,
            scheduled_date__lte=three_days_later,
            alert_sent=False,
        ).exclude(status=Maintenance.Status.COMPLETED).select_related("vehicle")

        staff_users = list(
            User.objects.filter(role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER], is_active=True)
        )

        sent_count = 0
        for m in upcoming_records:
            for staff in staff_users:
                notify(
                    user=staff,
                    title="Upcoming Vehicle Maintenance",
                    message=(
                        f"Maintenance alert: Vehicle {m.vehicle.registration_number} ({m.vehicle.brand} {m.vehicle.model}) "
                        f"is scheduled for '{m.title}' on {m.scheduled_date}."
                    ),
                    type=Notification.NotificationType.VEHICLE,
                )
            m.alert_sent = True
            m.save(update_fields=["alert_sent", "updated_at"])
            sent_count += 1

        self.stdout.write(
            self.style.SUCCESS(f"Successfully processed maintenance alerts for {sent_count} vehicles.")
        )
