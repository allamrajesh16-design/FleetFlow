from django.core.management.base import BaseCommand
from bookings.services import check_bus_schedules


class Command(BaseCommand):
    help = "Evaluate OPEN bus schedules departing within 10 hours against the minimum passenger threshold."

    def handle(self, *args, **options):
        result = check_bus_schedules()
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully checked bus schedules: {result['processed']} processed "
                f"({result['confirmed']} confirmed, {result['cancelled']} cancelled)."
            )
        )
