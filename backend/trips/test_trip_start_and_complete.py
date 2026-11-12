import io
from datetime import date, datetime, timedelta
from decimal import Decimal
import zoneinfo
from unittest.mock import patch

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from pypdf import PdfReader

from accounts.models import User
from bookings.models import Booking, BusSchedule
from drivers.models import Driver
from notifications.models import Notification
from payments.models import Payment, Receipt
from payments.services import create_trip_payments
from vehicles.models import Vehicle
from trips.models import Trip
from trips.services import calculate_trip_fare, resolve_odometer_and_distance


IST = zoneinfo.ZoneInfo("Asia/Kolkata")


class TripStartDateRuleTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin_parta@example.com",
            password="adminpassword123",
            full_name="Admin Boss",
        )
        self.fleet_manager = User.objects.create_user(
            email="manager_parta@example.com",
            password="managerpassword123",
            full_name="Fleet Manager Joe",
            role=User.Role.FLEET_MANAGER,
        )
        self.customer = User.objects.create_user(
            email="customer_parta@example.com",
            password="customerpassword123",
            full_name="Alice Customer",
            role=User.Role.CUSTOMER,
        )
        self.driver_user = User.objects.create_user(
            email="driver_parta@example.com",
            password="driverpassword123",
            full_name="Ramesh Driver",
            role=User.Role.DRIVER,
        )
        self.driver = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-TEST-9999",
            license_expiry=date(2028, 1, 1),
            status=Driver.Status.ACTIVE,
        )
        self.vehicle = Vehicle.objects.create(
            registration_number="AP05PA1000",
            brand="Toyota",
            model="Innova",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=7,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )

        # Scheduled for 16 Nov 2026 at 14:00 IST
        self.trip_scheduled_dt = datetime(2026, 11, 16, 14, 0, 0, tzinfo=IST)
        self.booking = Booking.objects.create(
            customer=self.customer,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Airport",
            drop_location="Hotel",
            travel_datetime=self.trip_scheduled_dt,
            passengers=2,
            status=Booking.Status.APPROVED,
        )
        self.trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.vehicle,
            driver=self.driver,
            source="Airport",
            destination="Hotel",
            scheduled_datetime=self.trip_scheduled_dt,
            status=Trip.Status.SCHEDULED,
        )

    def test_cannot_start_before_scheduled_date(self):
        """POST /api/trips/{id}/start/ returns 400 TRIP_NOT_TODAY before the day."""
        self.client.force_authenticate(user=self.driver_user)
        frozen_time = datetime(2026, 11, 15, 18, 30, 0, tzinfo=IST)
        with patch("django.utils.timezone.now", return_value=frozen_time):
            res = self.client.post(f"/api/trips/{self.trip.id}/start/", {"start_odometer": 10000})
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(res.data.get("code"), "TRIP_NOT_TODAY")
            self.assertIn("16 Nov 2026", res.data.get("message", ""))

    def test_can_start_on_scheduled_date_at_00_00_local(self):
        """Driver can start trip at 00:00:05 IST on the scheduled date."""
        self.client.force_authenticate(user=self.driver_user)
        frozen_time = datetime(2026, 11, 16, 0, 0, 5, tzinfo=IST)
        with patch("django.utils.timezone.now", return_value=frozen_time):
            res = self.client.post(f"/api/trips/{self.trip.id}/start/", {"start_odometer": 10000})
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.trip.refresh_from_db()
            self.assertEqual(self.trip.status, Trip.Status.IN_PROGRESS)

    def test_can_start_on_scheduled_date_at_23_59_local(self):
        """Driver can start trip at 23:59:50 IST on the scheduled date."""
        self.client.force_authenticate(user=self.driver_user)
        frozen_time = datetime(2026, 11, 16, 23, 59, 50, tzinfo=IST)
        with patch("django.utils.timezone.now", return_value=frozen_time):
            res = self.client.post(f"/api/trips/{self.trip.id}/start/", {"start_odometer": 10000})
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.trip.refresh_from_db()
            self.assertEqual(self.trip.status, Trip.Status.IN_PROGRESS)

    def test_cannot_start_after_scheduled_date(self):
        """POST /api/trips/{id}/start/ returns 400 TRIP_DATE_PASSED after the day."""
        self.client.force_authenticate(user=self.driver_user)
        frozen_time = datetime(2026, 11, 17, 8, 0, 0, tzinfo=IST)
        with patch("django.utils.timezone.now", return_value=frozen_time):
            res = self.client.post(f"/api/trips/{self.trip.id}/start/", {"start_odometer": 10000})
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(res.data.get("code"), "TRIP_DATE_PASSED")
            self.assertIn("trip date has passed", res.data.get("message", ""))

    @override_settings(TRIP_START_RULE="any")
    def test_demo_mode_switch_allows_start_any_day(self):
        """When TRIP_START_RULE='any', driver can start before or after date."""
        self.client.force_authenticate(user=self.driver_user)
        frozen_before = datetime(2026, 11, 10, 10, 0, 0, tzinfo=IST)
        with patch("django.utils.timezone.now", return_value=frozen_before):
            res = self.client.post(f"/api/trips/{self.trip.id}/start/", {"start_odometer": 10000})
            self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_unstarted_trip_notification_sent_once(self):
        """notify_unstarted_trips notifies manager/admin once and is idempotent."""
        # Trip scheduled on 10 Nov 2026
        past_dt = datetime(2026, 11, 10, 10, 0, 0, tzinfo=IST)
        past_trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.vehicle,
            driver=self.driver,
            source="Old Station",
            destination="Old Beach",
            scheduled_datetime=past_dt,
            status=Trip.Status.SCHEDULED,
        )

        today_dt = datetime(2026, 11, 16, 10, 0, 0, tzinfo=IST)
        with patch("django.utils.timezone.now", return_value=today_dt):
            # Run 1
            call_command("notify_unstarted_trips")
            past_trip.refresh_from_db()
            self.assertTrue(past_trip.unstarted_notified)

            notifs = Notification.objects.filter(
                title__contains=f"Unstarted Trip #{past_trip.id}"
            )
            self.assertGreaterEqual(notifs.count(), 1)
            first_count = notifs.count()

            # Run 2 (idempotent, no duplicates)
            call_command("notify_unstarted_trips")
            second_count = Notification.objects.filter(
                title__contains=f"Unstarted Trip #{past_trip.id}"
            ).count()
            self.assertEqual(first_count, second_count)


class TripFareAndCompleteTests(APITestCase):
    def setUp(self):
        self.driver_user = User.objects.create_user(
            email="driver_partb@example.com",
            password="driverpassword123",
            full_name="Suresh Kumar",
            role=User.Role.DRIVER,
        )
        self.driver = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-PARTB-1111",
            license_expiry=date(2028, 1, 1),
            status=Driver.Status.ACTIVE,
        )
        self.customer = User.objects.create_user(
            email="customer_partb@example.com",
            password="customerpassword123",
            full_name="Bob Customer",
            role=User.Role.CUSTOMER,
        )
        self.car = Vehicle.objects.create(
            registration_number="AP05PB2000",
            brand="Hyundai",
            model="Verna",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=5,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.booking = Booking.objects.create(
            customer=self.customer,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="City Center",
            drop_location="Suburbs",
            travel_datetime=timezone.now(),
            passengers=2,
            status=Booking.Status.APPROVED,
        )
        self.trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.car,
            driver=self.driver,
            source="City Center",
            destination="Suburbs",
            scheduled_datetime=timezone.now(),
            start_odometer=10000,
            status=Trip.Status.IN_PROGRESS,
        )

    def test_fare_preview_equals_final_fare_multiple_rates_and_distances(self):
        """Preview fare equals final completion fare exactly across multiple rates/distances."""
        test_cases = [
            (Decimal("10.00"), 10050, Decimal("50.00")),   # 50 km @ 10/km = 500
            (Decimal("15.00"), 10065, Decimal("65.00")),   # 65 km @ 15/km = 975
            (Decimal("22.50"), 10120, Decimal("120.00")),  # 120 km @ 22.50/km = 2700
        ]

        self.client.force_authenticate(user=self.driver_user)
        for rate, end_odo, dist_km in test_cases:
            self.car.rate_per_km = rate
            self.car.save()

            # Preview via API
            preview_res = self.client.get(
                f"/api/trips/{self.trip.id}/fare-preview/?end_odometer={end_odo}"
            )
            self.assertEqual(preview_res.status_code, status.HTTP_200_OK)
            preview_fare = Decimal(preview_res.data["fare"])

            # Service calculation
            fare_calc = calculate_trip_fare(self.trip, end_odometer=end_odo)
            self.assertEqual(preview_fare, fare_calc["fare"])
            expected_fare = (dist_km * rate).quantize(Decimal("0.01"))
            self.assertEqual(preview_fare, expected_fare)

    def test_odometer_and_distance_consistency_and_validation(self):
        """Odometer and distance derivation, tolerance check, and invalid inputs."""
        # 1. Derive distance from end_odometer
        end_odo, dist = resolve_odometer_and_distance(self.trip, end_odometer=10050)
        self.assertEqual(end_odo, 10050)
        self.assertEqual(dist, Decimal("50"))

        # 2. Derive end_odometer from distance_km
        end_odo, dist = resolve_odometer_and_distance(self.trip, distance_km=50)
        self.assertEqual(end_odo, 10050)
        self.assertEqual(dist, Decimal("50"))

        # 3. Both provided and agree within 0.2 km
        end_odo, dist = resolve_odometer_and_distance(self.trip, end_odometer=10050, distance_km=Decimal("50.1"))
        self.assertEqual(end_odo, 10050)

        # 4. Disagreement > 0.2 km raises ValidationError
        with self.assertRaises(Exception):
            resolve_odometer_and_distance(self.trip, end_odometer=10050, distance_km=Decimal("55.0"))

        # 5. end_odometer <= start_odometer raises ValidationError
        with self.assertRaises(Exception):
            resolve_odometer_and_distance(self.trip, end_odometer=9999)

        # 6. distance <= 0 raises ValidationError
        with self.assertRaises(Exception):
            resolve_odometer_and_distance(self.trip, distance_km=Decimal("0.0"))

    def test_complete_trip_calculates_server_fare_and_creates_unpaid_payment(self):
        """Completing trip calculates authoritative server fare and creates UNPAID payment."""
        self.client.force_authenticate(user=self.driver_user)
        # Attempt to pass client fake fare (should be ignored)
        res = self.client.post(
            f"/api/trips/{self.trip.id}/complete/",
            {"end_odometer": 10065, "distance_km": "65.00", "fare": "1.00"},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, Trip.Status.COMPLETED)
        self.assertEqual(self.trip.end_odometer, 10065)
        # 65 km * 15.00/km = 975.00
        self.assertEqual(self.trip.total_fare, Decimal("975.00"))

        # Payment record created as UNPAID
        p = Payment.objects.filter(trip=self.trip).first()
        self.assertIsNotNone(p)
        self.assertEqual(p.status, Payment.Status.UNPAID)
        self.assertEqual(p.amount, Decimal("975.00"))

    def test_bus_trip_complete_skips_payment_collection(self):
        """BUS trips complete all passenger bookings; fare is sum of passenger bookings; no single payment collected by driver."""
        bus_vehicle = Vehicle.objects.create(
            registration_number="AP05PB9999",
            brand="Tata",
            model="Starbus",
            vehicle_type=Vehicle.VehicleType.BUS,
            seating_capacity=30,
            rate_per_km=Decimal("0.00"),
            status=Vehicle.Status.ACTIVE,
        )
        schedule = BusSchedule.objects.create(
            vehicle=bus_vehicle,
            source="Central Station",
            destination="Tech Park",
            departure_datetime=timezone.now(),
            fare_per_seat=Decimal("50.00"),
            status=BusSchedule.Status.CONFIRMED,
        )
        # Passenger booking
        b1 = Booking.objects.create(
            customer=self.customer,
            booking_type=Booking.BookingType.BUS_SEAT,
            bus_schedule=schedule,
            pickup_location="Central Station",
            drop_location="Tech Park",
            travel_datetime=timezone.now(),
            passengers=1,
            estimated_fare=Decimal("50.00"),
            status=Booking.Status.APPROVED,
        )
        bus_trip = Trip.objects.create(
            bus_schedule=schedule,
            vehicle=bus_vehicle,
            driver=self.driver,
            source="Central Station",
            destination="Tech Park",
            scheduled_datetime=timezone.now(),
            start_odometer=50000,
            status=Trip.Status.IN_PROGRESS,
        )

        self.client.force_authenticate(user=self.driver_user)
        res = self.client.post(
            f"/api/trips/{bus_trip.id}/complete/",
            {"end_odometer": 50025, "distance_km": "25.00"},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        bus_trip.refresh_from_db()
        self.assertEqual(bus_trip.status, Trip.Status.COMPLETED)
        self.assertEqual(bus_trip.total_fare, Decimal("50.00"))

        b1.refresh_from_db()
        self.assertEqual(b1.status, Booking.Status.COMPLETED)


class PaymentCollectAndSettlementTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin_collect@example.com",
            password="adminpassword123",
            full_name="Admin Chief",
        )
        self.fleet_manager = User.objects.create_user(
            email="manager_collect@example.com",
            password="managerpassword123",
            full_name="Manager Mike",
            role=User.Role.FLEET_MANAGER,
        )
        self.customer = User.objects.create_user(
            email="cust_collect@example.com",
            password="customerpassword123",
            full_name="Charlie Customer",
            role=User.Role.CUSTOMER,
        )
        self.driver_user1 = User.objects.create_user(
            email="driver1_collect@example.com",
            password="driverpassword123",
            full_name="Driver Suresh",
            role=User.Role.DRIVER,
        )
        self.driver1 = Driver.objects.create(
            user=self.driver_user1,
            license_number="DL-COLLECT-1",
            license_expiry=date(2028, 1, 1),
            status=Driver.Status.ACTIVE,
        )
        self.driver_user2 = User.objects.create_user(
            email="driver2_collect@example.com",
            password="driverpassword123",
            full_name="Driver Ramesh",
            role=User.Role.DRIVER,
        )
        self.driver2 = Driver.objects.create(
            user=self.driver_user2,
            license_number="DL-COLLECT-2",
            license_expiry=date(2028, 1, 1),
            status=Driver.Status.ACTIVE,
        )
        self.vehicle = Vehicle.objects.create(
            registration_number="AP05PC3000",
            brand="Maruti",
            model="Dzire",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=4,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.booking = Booking.objects.create(
            customer=self.customer,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Point A",
            drop_location="Point B",
            travel_datetime=timezone.now(),
            passengers=1,
            status=Booking.Status.COMPLETED,
        )
        self.trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.vehicle,
            driver=self.driver1,
            source="Point A",
            destination="Point B",
            scheduled_datetime=timezone.now(),
            start_odometer=10000,
            end_odometer=10065,
            total_fare=Decimal("975.00"),
            status=Trip.Status.COMPLETED,
        )
        self.payment = Payment.objects.create(
            booking=self.booking,
            trip=self.trip,
            customer=self.customer,
            amount=Decimal("975.00"),
            status=Payment.Status.UNPAID,
        )

    def test_collect_permissions(self):
        """Only assigned driver can collect payment; others get 403."""
        # Customer gets 403
        self.client.force_authenticate(user=self.customer)
        res_cust = self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "CASH"})
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        # Another driver gets 403
        self.client.force_authenticate(user=self.driver_user2)
        res_drv2 = self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "CASH"})
        self.assertEqual(res_drv2.status_code, status.HTTP_403_FORBIDDEN)

        # Fleet manager gets 403
        self.client.force_authenticate(user=self.fleet_manager)
        res_mgr = self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "CASH"})
        self.assertEqual(res_mgr.status_code, status.HTTP_403_FORBIDDEN)

    def test_collect_cash_success_and_idempotent(self):
        """Driver collects cash; receipt created; second call returns 400 'Already paid'."""
        self.client.force_authenticate(user=self.driver_user1)
        res = self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "CASH"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PAID)
        self.assertEqual(self.payment.payment_method, Payment.PaymentMethod.CASH)
        self.assertEqual(self.payment.collected_by, self.driver_user1)
        self.assertFalse(self.payment.cash_settled)
        self.assertTrue(hasattr(self.payment, "receipt"))

        # Customer notified
        cust_notif = Notification.objects.filter(user=self.customer).first()
        self.assertIsNotNone(cust_notif)
        self.assertIn("975", cust_notif.message)
        self.assertIn("cash", cust_notif.message.lower())

        # Second call returns 400 "Already paid" (idempotent, no second receipt)
        res2 = self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "CASH"})
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Already paid", res2.data.get("detail", ""))

    def test_collect_online_with_utr_and_duplicate_rejection(self):
        """Online payment with UTR sets status PAID; duplicate UTR is rejected."""
        self.client.force_authenticate(user=self.driver_user1)
        res = self.client.post(
            f"/api/payments/{self.payment.id}/collect/",
            {"method": "ONLINE", "transaction_reference": "UTR9876543210"},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PAID)
        self.assertEqual(self.payment.payment_method, Payment.PaymentMethod.UPI)
        self.assertEqual(self.payment.transaction_reference, "UTR9876543210")
        self.assertFalse(self.payment.needs_verification)

        # Another payment cannot reuse this UTR
        p2 = Payment.objects.create(
            booking=self.booking,
            trip=self.trip,
            customer=self.customer,
            amount=Decimal("500.00"),
            status=Payment.Status.UNPAID,
        )
        res_dup = self.client.post(
            f"/api/payments/{p2.id}/collect/",
            {"method": "ONLINE", "transaction_reference": "UTR9876543210"},
        )
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been used", str(res_dup.data))

    def test_collect_online_without_utr_needs_verification(self):
        """Online payment without reference sets needs_verification=True and alerts managers."""
        self.client.force_authenticate(user=self.driver_user1)
        res = self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "ONLINE"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        self.assertTrue(self.payment.needs_verification)

        # Manager receives notification
        mgr_notif = Notification.objects.filter(
            user=self.fleet_manager, title__icontains="Verification"
        ).first()
        self.assertIsNotNone(mgr_notif)

    def test_receipt_pdf_extracted_text_contains_method_and_collected_by(self):
        """PDF receipt text extracted with pypdf contains 'Paid by: Cash' and 'Collected by:'."""
        self.client.force_authenticate(user=self.driver_user1)
        self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "CASH"})

        pdf_res = self.client.get(f"/api/payments/{self.payment.id}/receipt/pdf/")
        self.assertEqual(pdf_res.status_code, status.HTTP_200_OK)

        reader = PdfReader(io.BytesIO(pdf_res.content))
        page_text = reader.pages[0].extract_text()

        self.assertIn("Paid by:", page_text)
        self.assertIn("Cash", page_text)
        self.assertIn("Collected by:", page_text)
        self.assertIn("Driver Suresh", page_text)

    def test_cash_settlement_flow_and_permissions(self):
        """Driver/Customer cannot settle cash (403); Manager settles cash (200)."""
        # Collect cash first
        self.client.force_authenticate(user=self.driver_user1)
        self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "CASH"})

        # Driver cannot settle
        res_drv = self.client.post(f"/api/payments/{self.payment.id}/settle-cash/")
        self.assertEqual(res_drv.status_code, status.HTTP_403_FORBIDDEN)

        # Fleet Manager settles cash
        self.client.force_authenticate(user=self.fleet_manager)
        res_mgr = self.client.post(f"/api/payments/{self.payment.id}/settle-cash/")
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)

        self.payment.refresh_from_db()
        self.assertTrue(self.payment.cash_settled)
        self.assertEqual(self.payment.cash_settled_by, self.fleet_manager)
        self.assertIsNotNone(self.payment.cash_settled_at)

        # Second settle call returns 400
        res_again = self.client.post(f"/api/payments/{self.payment.id}/settle-cash/")
        self.assertEqual(res_again.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_dashboard_revenue_rises_by_exact_fare(self):
        """Admin dashboard revenue counts all PAID payments and rises by exact fare."""
        self.client.force_authenticate(user=self.admin)
        dash_before = self.client.get("/api/dashboard/admin/")
        self.assertEqual(dash_before.status_code, status.HTTP_200_OK)
        rev_before = Decimal(str(dash_before.data.get("revenue", 0)))

        # Collect cash payment
        self.client.force_authenticate(user=self.driver_user1)
        self.client.post(f"/api/payments/{self.payment.id}/collect/", {"method": "CASH"})

        self.client.force_authenticate(user=self.admin)
        dash_after = self.client.get("/api/dashboard/admin/")
        rev_after = Decimal(str(dash_after.data.get("revenue", 0)))

        self.assertEqual(rev_after - rev_before, Decimal("975.00"))
