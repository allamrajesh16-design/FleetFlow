import getpass
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

DEMO_EMAILS = [
    'admin@fleetflow.com',
    'manager@fleetflow.com',
    'driver1@fleetflow.com',
    'driver2@fleetflow.com',
    'driver3@fleetflow.com',
    'driver5@fleetflow.com',
    'customer1@fleetflow.com',
    'customer2@fleetflow.com',
    'customer3@fleetflow.com',
    'customer4@fleetflow.com',
    'customer5@fleetflow.com',
]

class Command(BaseCommand):
    help = 'Change password for all demo accounts at once without echoing or storing passwords.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("=== FleetFlow Set Demo Password ==="))
        
        # Prompt twice without echoing password to screen
        pwd1 = getpass.getpass("Enter new password for demo accounts: ")
        if not pwd1:
            self.stdout.write(self.style.ERROR("Password cannot be empty."))
            return

        if len(pwd1) < 6:
            self.stdout.write(self.style.ERROR("Password must be at least 6 characters long."))
            return

        pwd2 = getpass.getpass("Confirm new password: ")
        if pwd1 != pwd2:
            self.stdout.write(self.style.ERROR("Passwords do not match. Aborting."))
            return

        # Find demo users (by email in list or ending with @fleetflow.com)
        users = User.objects.filter(email__in=DEMO_EMAILS)
        if not users.exists():
            users = User.objects.filter(email__endswith='@fleetflow.com')

        updated_count = 0
        for user in users:
            user.set_password(pwd1)
            user.save(update_fields=['password'])
            updated_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully updated password for {updated_count} demo user(s)."))
