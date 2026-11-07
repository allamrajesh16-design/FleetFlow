import re
from django.core.management.base import BaseCommand
from notifications.models import Notification

# Pattern strictly matching 10-digit Indian phone numbers with optional +91 prefix
PHONE_REGEX = re.compile(r'(?:\+91[\-\s]?)?[6-9]\d{9}\b')

def mask_digits_for_print(phone_str):
    """Mask only digits in the printed terminal output so raw numbers are never exposed in reports/logs."""
    if phone_str.startswith('+91'):
        prefix = '+91 '
        digits = phone_str[3:].replace('-', '').replace(' ', '')
    else:
        prefix = ''
        digits = phone_str
    if len(digits) >= 10:
        return f"{prefix}{digits[:2]}******{digits[-2:]}"
    return "******"

class Command(BaseCommand):
    help = 'Redacts 10-digit mobile phone numbers in notification messages.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Apply changes to database. Default is dry-run mode.',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']
        mode_str = "APPLY MODE" if apply_changes else "DRY-RUN MODE (default, no database changes)"
        self.stdout.write(self.style.NOTICE(f"--- Running redact_notification_phones in {mode_str} ---"))
        self.stdout.write(f"Matched Regex Pattern: {PHONE_REGEX.pattern}\n")

        notifications = Notification.objects.all()
        target_records = []

        for n in notifications:
            if n.message and PHONE_REGEX.search(n.message):
                # Target replacement: in production/database, mask internal digits with asterisks
                new_message = PHONE_REGEX.sub(lambda m: mask_digits_for_print(m.group(0)), n.message)
                target_records.append((n, new_message))

        total_count = len(target_records)
        self.stdout.write(f"Total notification records containing phone numbers: {total_count}\n")

        if total_count == 0:
            self.stdout.write(self.style.SUCCESS("No notifications contain unredacted phone numbers."))
            return

        self.stdout.write("--- Sample Demonstrating Pattern Matching & Redaction ---")
        for idx, (notif, masked_preview) in enumerate(target_records[:5], 1):
            matches = PHONE_REGEX.findall(notif.message)
            masked_matches = [mask_digits_for_print(m) for m in matches]

            self.stdout.write(f"Record {idx} (ID: {notif.id}):")
            self.stdout.write(f"  Title: {notif.title}")
            self.stdout.write(f"  Matched Pattern Occurrence(s): {', '.join(masked_matches)}")
            
            # Print original message with digits masked in output for safety
            safe_orig = PHONE_REGEX.sub(lambda m: mask_digits_for_print(m.group(0)), notif.message)
            self.stdout.write(f"  Before (Digits masked in log): {safe_orig}")
            self.stdout.write(f"  After (Target preview):       {masked_preview}\n")

        if apply_changes:
            updated_count = 0
            for notif, masked_msg in target_records:
                notif.message = masked_msg
                notif.save(update_fields=['message'])
                updated_count += 1
            self.stdout.write(self.style.SUCCESS(f"Successfully redacted phone numbers in {updated_count} notifications."))
        else:
            self.stdout.write(self.style.WARNING("Dry-run complete. Database records remained unchanged. Run with '--apply' to persist."))
