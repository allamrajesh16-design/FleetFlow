import os
import sys
from datetime import date, timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone
from accounts.models import User
from vehicles.models import Vehicle
from drivers.models import Driver
from bookings.models import Booking, BusSchedule
from payments.models import Payment, PaymentQRSetting

class Command(BaseCommand):
    help = "Seed walkthrough-specific WT- data (DEBUG only, safe to run twice)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stderr.write("seed_walkthrough_data can only be run when DEBUG=True.")
            return

        password = os.getenv("WT_PASSWORD", "Walkthrough@2026!Sec")

        self.stdout.write("Seeding WT- users...")

        # 1. WT Customer 1 (Active, Verified, Approved)
        c1, created = User.objects.get_or_create(
            email="wt.customer+1@gmail.com",
            defaults={
                "full_name": "WT-Customer One",
                "phone": "9000000001",
                "role": User.Role.CUSTOMER,
                "is_active": True,
                "is_email_verified": True,
                "approval_status": User.ApprovalStatus.APPROVED,
            }
        )
        c1.set_password(password)
        c1.save()

        # 2. WT Customer 2 (Active, Verified, Approved)
        c2, created = User.objects.get_or_create(
            email="wt.customer+2@gmail.com",
            defaults={
                "full_name": "WT-Customer Two",
                "phone": "9000000002",
                "role": User.Role.CUSTOMER,
                "is_active": True,
                "is_email_verified": True,
                "approval_status": User.ApprovalStatus.APPROVED,
            }
        )
        c2.set_password(password)
        c2.save()

        # 3. WT Fleet Manager (Approved)
        fm, created = User.objects.get_or_create(
            email="wt.manager+1@gmail.com",
            defaults={
                "full_name": "WT-Fleet Manager One",
                "phone": "9000000003",
                "role": User.Role.FLEET_MANAGER,
                "is_active": True,
                "is_email_verified": True,
                "approval_status": User.ApprovalStatus.APPROVED,
            }
        )
        fm.set_password(password)
        fm.save()

        # 4. WT Driver User & Driver Model (Approved)
        d1_user, created = User.objects.get_or_create(
            email="wt.driver+1@gmail.com",
            defaults={
                "full_name": "WT-Driver One",
                "phone": "9000000004",
                "role": User.Role.DRIVER,
                "is_active": True,
                "is_email_verified": True,
                "approval_status": User.ApprovalStatus.APPROVED,
            }
        )
        d1_user.set_password(password)
        d1_user.save()

        d1, _ = Driver.objects.get_or_create(
            user=d1_user,
            defaults={
                "license_number": "WT-DL-2026-0001",
                "license_expiry": date.today() + timedelta(days=365),
                "status": Driver.Status.ACTIVE,
            }
        )

        # 5. WT Vehicles
        v_car, _ = Vehicle.objects.get_or_create(
            registration_number="WT AP 05 WT 0001",
            defaults={
                "vehicle_type": Vehicle.VehicleType.CAR,
                "brand": "Toyota",
                "model": "Innova WT",
                "seating_capacity": 6,
                "rate_per_km": Decimal("18.00"),
                "status": Vehicle.Status.ACTIVE,
            }
        )

        v_bike, _ = Vehicle.objects.get_or_create(
            registration_number="WT AP 05 WT 0002",
            defaults={
                "vehicle_type": Vehicle.VehicleType.BIKE,
                "brand": "Honda",
                "model": "Activa WT",
                "seating_capacity": 1,
                "rate_per_km": Decimal("7.00"),
                "status": Vehicle.Status.ACTIVE,
            }
        )

        v_bus, _ = Vehicle.objects.get_or_create(
            registration_number="WT AP 05 WT 0003",
            defaults={
                "vehicle_type": Vehicle.VehicleType.BUS,
                "brand": "Volvo",
                "model": "9400 WT",
                "seating_capacity": 40,
                "min_passengers": 10,
                "rate_per_km": Decimal("45.00"),
                "status": Vehicle.Status.ACTIVE,
            }
        )

        # 6. WT Bus Schedule
        dep_time = timezone.now() + timedelta(days=2)
        sched, _ = BusSchedule.objects.get_or_create(
            vehicle=v_bus,
            source="WT City Terminal",
            destination="WT Airport Express",
            defaults={
                "departure_datetime": dep_time,
                "fare_per_seat": Decimal("250.00"),
                "status": BusSchedule.Status.OPEN,
                "created_by": fm,
            }
        )

        self.stdout.write(self.style.SUCCESS("Successfully seeded walkthrough WT- data."))
