import os
from django.core.management.base import BaseCommand
from django.db.models import Q
from accounts.models import User
from vehicles.models import Vehicle, Maintenance
from drivers.models import Driver
from bookings.models import Booking, BusSchedule
from trips.models import Trip
from payments.models import Payment
from fuel.models import FuelLog
from expenses.models import Expense
from documents.models import Document

class Command(BaseCommand):
    help = "Cleanup ONLY WT- data and everything linked to it (asks for confirmation)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--noinput',
            action='store_true',
            help='Do not prompt for confirmation (use with caution).',
        )

    def handle(self, *args, **options):
        if not options.get('noinput'):
            confirm = input("Are you sure you want to delete all walkthrough (WT-) test data? Type 'yes' to proceed: ")
            if confirm.strip().lower() != 'yes':
                self.stdout.write("Cleanup aborted.")
                return

        self.stdout.write("Cleaning up WT- data...")

        # 1. Trips associated with WT vehicles or drivers
        trips = Trip.objects.filter(
            Q(vehicle__registration_number__startswith="WT") |
            Q(driver__user__email__startswith="wt.")
        )
        trip_count = trips.count()
        trips.delete()

        # 2. Bookings created by WT users or with WT pickup
        bookings = Booking.objects.filter(
            Q(customer__email__startswith="wt.") |
            Q(pickup_location__icontains="WT") |
            Q(drop_location__icontains="WT")
        )
        booking_count = bookings.count()
        bookings.delete()

        # 3. Bus Schedules
        scheds = BusSchedule.objects.filter(
            Q(vehicle__registration_number__startswith="WT") |
            Q(source__startswith="WT") |
            Q(destination__startswith="WT")
        )
        sched_count = scheds.count()
        scheds.delete()

        # 4. Expenses & Fuel logs
        fuel_count = FuelLog.objects.filter(
            Q(vehicle__registration_number__startswith="WT") |
            Q(driver__user__email__startswith="wt.")
        ).delete()[0]

        exp_count = Expense.objects.filter(
            Q(vehicle__registration_number__startswith="WT") |
            Q(submitted_by__email__startswith="wt.")
        ).delete()[0]

        # 5. Documents
        doc_count = Document.objects.filter(
            Q(vehicle__registration_number__startswith="WT") |
            Q(driver__user__email__startswith="wt.") |
            Q(uploaded_by__email__startswith="wt.")
        ).delete()[0]

        # 6. Drivers
        drv_count = Driver.objects.filter(
            Q(license_number__startswith="WT") |
            Q(user__email__startswith="wt.")
        ).delete()[0]

        # 7. Vehicles
        veh_count = Vehicle.objects.filter(
            registration_number__startswith="WT"
        ).delete()[0]

        # 8. Users
        usr_count = User.objects.filter(
            email__startswith="wt."
        ).delete()[0]

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully deleted: {usr_count} users, {veh_count} vehicles, {drv_count} drivers, "
                f"{booking_count} bookings, {sched_count} bus schedules, {trip_count} trips, "
                f"{doc_count} documents, {fuel_count} fuel logs, {exp_count} expenses."
            )
        )
