from django.core.management.base import BaseCommand
from accounts.models import User
from accounts.phone_validation import clean_indian_phone
from rest_framework import serializers


class Command(BaseCommand):
    help = "Lists users with an invalid stored phone number (read only)."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Checking user phone numbers in database..."))

        users = User.objects.all().order_by("id")
        invalid_users = []
        total_with_phone = 0

        for user in users:
            if not user.phone:
                continue
            total_with_phone += 1
            phone = user.phone.strip()

            reason = None
            if not phone.startswith("+91"):
                reason = "Does not start with +91 country prefix"
            else:
                try:
                    clean_indian_phone(phone)
                except serializers.ValidationError as err:
                    reason = str(err.detail[0] if isinstance(err.detail, list) else err.detail)

            if reason:
                invalid_users.append({
                    "id": user.id,
                    "email": user.email,
                    "phone": user.phone,
                    "role": user.role,
                    "reason": reason,
                })

        self.stdout.write(f"\nTotal users checked: {users.count()}")
        self.stdout.write(f"Users with phone: {total_with_phone}")

        if not invalid_users:
            self.stdout.write(self.style.SUCCESS("All stored phone numbers are valid!"))
            return

        self.stdout.write(self.style.WARNING(f"\nFound {len(invalid_users)} user(s) with invalid stored phone numbers:\n"))
        self.stdout.write(f"{'ID':<6} | {'Email':<30} | {'Role':<14} | {'Stored Phone':<16} | {'Reason'}")
        self.stdout.write("-" * 90)

        for item in invalid_users:
            self.stdout.write(
                f"{item['id']:<6} | {item['email']:<30} | {item['role']:<14} | {item['phone']:<16} | {item['reason']}"
            )

        self.stdout.write(self.style.NOTICE("\n(Read-only check complete. No database changes were made.)\n"))
