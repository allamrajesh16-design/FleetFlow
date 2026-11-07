from django.conf import settings
from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Send a test email using current settings to verify email configuration."

    def add_arguments(self, parser):
        parser.add_argument("address", type=str, help="Destination email address")

    def handle(self, *args, **options):
        recipient = options["address"]
        backend = getattr(settings, "EMAIL_BACKEND", "N/A")
        host = getattr(settings, "EMAIL_HOST", "N/A")
        port = getattr(settings, "EMAIL_PORT", "N/A")
        user = getattr(settings, "EMAIL_HOST_USER", "N/A")

        self.stdout.write(f"EMAIL_BACKEND: {backend}")
        self.stdout.write(f"EMAIL_HOST:    {host}")
        self.stdout.write(f"EMAIL_PORT:    {port}")
        self.stdout.write(f"EMAIL_USER:    {user}")

        try:
            subject = "FleetFlow Test Email"
            body = (
                "Hello,\n\n"
                "This is a test email sent from FleetFlow to verify that your SMTP email settings "
                "are working properly.\n\n"
                "If you received this message, email delivery is operational!\n\n"
                "Best regards,\n"
                "FleetFlow System"
            )
            from_email = getattr(settings, "DEFAULT_FROM_EMAIL", user)
            msg = EmailMessage(
                subject=subject,
                body=body,
                from_email=from_email,
                to=[recipient],
            )
            msg.send(fail_silently=False)
            self.stdout.write(self.style.SUCCESS("SENT"))
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"ERROR: {exc}"))
            err_str = str(exc).lower()
            if "535" in err_str or "authentication" in err_str or "badcredentials" in err_str:
                self.stdout.write(
                    self.style.WARNING(
                        "Explanation: Authentication failed (535). Use a Gmail App Password instead of your regular password. "
                        "Ensure 2-Step Verification is active on your Google account."
                    )
                )
            elif "timed out" in err_str or "timeout" in err_str or "connection refused" in err_str or "10060" in err_str or "10061" in err_str:
                self.stdout.write(
                    self.style.WARNING(
                        "Explanation: Connection timed out or refused. The network or firewall is blocking port 587. "
                        "Check your outbound port permissions."
                    )
                )
            elif "sender refused" in err_str or "550" in err_str or "553" in err_str:
                self.stdout.write(
                    self.style.WARNING(
                        "Explanation: Sender refused. DEFAULT_FROM_EMAIL must match your authenticated Gmail address."
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"Explanation: Email delivery failed due to: {exc}"
                    )
                )
