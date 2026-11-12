from django.core.management.base import BaseCommand
from django.utils import timezone
from accounts.models import User
from notifications.models import Notification, notify
from trips.models import Trip


class Command(BaseCommand):
    help = "Notifies Fleet Managers and Admins about SCHEDULED trips whose scheduled date has passed."

    def handle(self, *args, **options):
        today = timezone.localdate()
        unstarted = Trip.objects.filter(
            status=Trip.Status.SCHEDULED,
            unstarted_notified=False,
            scheduled_datetime__date__lt=today,
        ).select_related("driver__user")

        managers = list(
            User.objects.filter(
                role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER],
                is_active=True,
            )
        )

        notified_count = 0
        for trip in unstarted:
            trip_date = timezone.localdate(trip.scheduled_datetime)
            formatted_date = f"{trip_date.day} {trip_date.strftime('%b %Y')}"
            title = f"Unstarted Trip #{trip.id}"
            message = f"Trip #{trip.id} was not started on {formatted_date}"

            for manager in managers:
                notify(
                    user=manager,
                    title=title,
                    message=message,
                    type=Notification.NotificationType.TRIP,
                    item_type="trip",
                    item_id=trip.id,
                )

            trip.unstarted_notified = True
            trip.save(update_fields=["unstarted_notified"])
            notified_count += 1

        self.stdout.write(
            self.style.SUCCESS(f"Successfully notified for {notified_count} unstarted trips.")
        )
