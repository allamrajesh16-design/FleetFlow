from django.core.management.base import BaseCommand
from django.utils import timezone
from payments.models import Payment


class Command(BaseCommand):
    help = "Expire unpaid or payment-initiated QR tokens that have passed their expiration timestamp."

    def handle(self, *args, **options):
        now = timezone.now()
        count = (
            Payment.objects.filter(
                status__in=[Payment.Status.UNPAID, Payment.Status.PAYMENT_INITIATED],
                qr_expires_at__lt=now,
                qr_token__isnull=False,
            )
            .exclude(status=Payment.Status.PAID)
            .update(status=Payment.Status.EXPIRED)
        )

        self.stdout.write(
            self.style.SUCCESS(f"Successfully marked {count} payment QR tokens as EXPIRED.")
        )
