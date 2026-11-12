from datetime import timedelta
import logging
from django.core.management.base import BaseCommand
from django.utils import timezone
from accounts.models import User

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Purges unverified user registrations older than 24 hours. "
        "Dry-run by default. Pass --apply to actually delete records."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Perform actual deletion. Without this flag, only a dry run is executed.",
        )
        parser.add_argument(
            "--hours",
            type=int,
            default=24,
            help="Age threshold in hours for unverified accounts (default: 24).",
        )

    def handle(self, *args, **options):
        apply_deletion = options["apply"]
        hours = options["hours"]
        cutoff = timezone.now() - timedelta(hours=hours)

        # Query only non-admin users whose email is unverified and created before the cutoff
        unverified_qs = User.objects.filter(
            is_email_verified=False,
            created_at__lt=cutoff,
        ).exclude(role=User.Role.ADMIN)

        count = unverified_qs.count()

        if not apply_deletion:
            self.stdout.write(
                self.style.NOTICE(
                    f"[DRY-RUN] Found {count} unverified account(s) created before {cutoff.isoformat()} (> {hours}h old)."
                )
            )
            for user in unverified_qs[:20]:
                self.stdout.write(f"  - ID: {user.id}, Email: {user.email}, Role: {user.role}, Created: {user.created_at}")
            if count > 20:
                self.stdout.write(f"  ... and {count - 20} more.")
            self.stdout.write(
                self.style.WARNING("Dry-run complete. No accounts were deleted. Pass --apply to delete.")
            )
            return None

        # Apply deletion
        deleted_count, details = unverified_qs.delete()
        user_deleted_count = details.get(User._meta.label, count)
        msg = f"Successfully purged {user_deleted_count} unverified account(s) older than {hours} hours."
        logger.info(msg)
        self.stdout.write(self.style.SUCCESS(msg))
        return None
