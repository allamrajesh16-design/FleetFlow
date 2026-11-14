from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from bookings.models import Booking, BusSchedule
from drivers.models import Driver
from notifications.models import Notification
from vehicles.models import Vehicle
from trips.models import Trip
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from io import BytesIO
from PIL import Image

from .gateway import (
    generate_gateway_signature,
    set_force_gateway_failure,
    verify_gateway_signature,
)
from .models import Payment, Receipt, PaymentQRSetting


@override_settings(PAYMENT_MODE="MOCK_GATEWAY")
class Stage6PaymentTests(APITestCase):
    def setUp(self):
        set_force_gateway_failure(False)

        # Users
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpassword123",
            full_name="Admin Staff",
        )
        self.fleet_manager = User.objects.create_user(
            email="manager@example.com",
            password="managerpassword123",
            full_name="Fleet Manager",
            role=User.Role.FLEET_MANAGER,
        )
        self.customer1 = User.objects.create_user(
            email="cust1@example.com",
            password="custpassword123",
            full_name="Alice Customer",
            role=User.Role.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email="cust2@example.com",
            password="custpassword123",
            full_name="Bob Customer",
            role=User.Role.CUSTOMER,
        )
        self.driver_user = User.objects.create_user(
            email="driver@example.com",
            password="driverpassword123",
            full_name="Dave Driver",
            role=User.Role.DRIVER,
        )

        # Driver profile
        self.driver = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-PAY-1234",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        # Vehicles
        self.car = Vehicle.objects.create(
            registration_number="KA01PAY100",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Honda",
            model="City",
            seating_capacity=4,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.bus = Vehicle.objects.create(
            registration_number="KA01PAY999",
            vehicle_type=Vehicle.VehicleType.BUS,
            brand="Volvo",
            model="Multi-Axle",
            seating_capacity=35,
            min_passengers=10,
            rate_per_km=Decimal("40.00"),
            status=Vehicle.Status.ACTIVE,
        )

        # Bookings
        self.booking_car = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            vehicle=self.car,
            pickup_location="Point A",
            drop_location="Point B",
            travel_datetime=timezone.now() + timedelta(days=1),
            passengers=2,
            estimated_distance_km=Decimal("20.00"),
            estimated_fare=Decimal("300.00"),
            status=Booking.Status.APPROVED,
        )

    def tearDown(self):
        set_force_gateway_failure(False)

    # 1. Completing a car trip creates one UNPAID payment with the correct fare
    def test_complete_car_trip_creates_unpaid_payment_with_correct_fare(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="Point A",
            destination="Point B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            start_odometer=1000,
            started_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.driver_user)
        # End odometer 1020 -> 20 km * 15 rate = 300.00 fare
        res = self.client.post(f"/api/trips/{trip.id}/complete/", {"end_odometer": 1020})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        payments = Payment.objects.filter(trip=trip)
        self.assertEqual(payments.count(), 1)
        payment = payments.first()
        self.assertEqual(payment.status, Payment.Status.UNPAID)
        self.assertEqual(payment.amount, Decimal("300.00"))
        self.assertEqual(payment.customer, self.customer1)

        # Customer notified of pending payment
        notif = Notification.objects.filter(user=self.customer1, title="Payment Pending")
        self.assertTrue(notif.exists())
        self.assertIn("Rs. 300.00", notif.first().message)

    # 2. Completing a bus trip creates one payment per booking
    def test_complete_bus_trip_creates_one_payment_per_booking(self):
        bus_sched = BusSchedule.objects.create(
            vehicle=self.bus,
            source="Bangalore",
            destination="Goa",
            departure_datetime=timezone.now() + timedelta(days=1),
            fare_per_seat=Decimal("800.00"),
            status=BusSchedule.Status.CONFIRMED,
        )
        b1 = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.BUS_SEAT,
            vehicle_type=Booking.VehicleType.BUS,
            vehicle=self.bus,
            bus_schedule=bus_sched,
            pickup_location="Bangalore",
            drop_location="Goa",
            travel_datetime=bus_sched.departure_datetime,
            passengers=2,
            estimated_fare=Decimal("1600.00"),
            status=Booking.Status.APPROVED,
        )
        b2 = Booking.objects.create(
            customer=self.customer2,
            booking_type=Booking.BookingType.BUS_SEAT,
            vehicle_type=Booking.VehicleType.BUS,
            vehicle=self.bus,
            bus_schedule=bus_sched,
            pickup_location="Bangalore",
            drop_location="Goa",
            travel_datetime=bus_sched.departure_datetime,
            passengers=1,
            estimated_fare=Decimal("800.00"),
            status=Booking.Status.APPROVED,
        )

        bus_trip = Trip.objects.create(
            bus_schedule=bus_sched,
            vehicle=self.bus,
            driver=self.driver,
            source="Bangalore",
            destination="Goa",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            start_odometer=5000,
            started_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.driver_user)
        res = self.client.post(f"/api/trips/{bus_trip.id}/complete/", {"end_odometer": 5600})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        bus_payments = Payment.objects.filter(trip=bus_trip)
        self.assertEqual(bus_payments.count(), 2)

        p1 = bus_payments.get(booking=b1)
        self.assertEqual(p1.customer, self.customer1)
        self.assertEqual(p1.amount, Decimal("1600.00"))

        p2 = bus_payments.get(booking=b2)
        self.assertEqual(p2.customer, self.customer2)
        self.assertEqual(p2.amount, Decimal("800.00"))

    # 3. Driver generates a QR and the response has a QR image and expiry
    def test_driver_generates_qr_code(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
            total_fare=Decimal("350.00"),
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("350.00"),
            status=Payment.Status.UNPAID,
        )

        self.client.force_authenticate(user=self.driver_user)
        res = self.client.post(f"/api/payments/{payment.id}/generate-qr/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("qr_token", res.data)
        self.assertIn("expires_at", res.data)
        self.assertEqual(Decimal(str(res.data["amount"])), Decimal("350.00"))
        self.assertTrue(res.data["qr_image_base64"].startswith("data:image/png;base64,"))

        payment.refresh_from_db()
        self.assertIsNotNone(payment.qr_token)
        self.assertFalse(payment.qr_used)

    # 4. Customer scans: status becomes PAYMENT_INITIATED
    def test_customer_scans_qr_token(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="City A",
            destination="City B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
            total_fare=Decimal("250.00"),
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("250.00"),
            status=Payment.Status.UNPAID,
            qr_token="token_test_123",
            qr_expires_at=timezone.now() + timedelta(minutes=10),
            qr_used=False,
        )

        self.client.force_authenticate(user=self.customer1)
        res = self.client.post("/api/payments/scan/", {"qr_token": "token_test_123"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PAYMENT_INITIATED")
        self.assertEqual(Decimal(str(res.data["amount"])), Decimal("250.00"))

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAYMENT_INITIATED)

    # 5. Another customer scanning the same token gets 403
    def test_wrong_customer_scanning_token_gets_403(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="City A",
            destination="City B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("200.00"),
            status=Payment.Status.UNPAID,
            qr_token="token_alice_only",
            qr_expires_at=timezone.now() + timedelta(minutes=10),
            qr_used=False,
        )

        self.client.force_authenticate(user=self.customer2)  # Bob
        res = self.client.post("/api/payments/scan/", {"qr_token": "token_alice_only"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 6. Expired token is rejected and the payment becomes EXPIRED
    def test_expired_token_is_rejected_and_status_becomes_expired(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="City A",
            destination="City B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("150.00"),
            status=Payment.Status.UNPAID,
            qr_token="token_expired_111",
            qr_expires_at=timezone.now() - timedelta(minutes=5),  # expired
            qr_used=False,
        )

        self.client.force_authenticate(user=self.customer1)
        res = self.client.post("/api/payments/scan/", {"qr_token": "token_expired_111"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", str(res.data).lower())

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.EXPIRED)

    # 7. A used token cannot be scanned again
    def test_used_token_cannot_be_scanned_again(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="City A",
            destination="City B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("180.00"),
            status=Payment.Status.UNPAID,
            qr_token="token_used_999",
            qr_expires_at=timezone.now() + timedelta(minutes=10),
            qr_used=True,  # already used
        )

        self.client.force_authenticate(user=self.customer1)
        res = self.client.post("/api/payments/scan/", {"qr_token": "token_used_999"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been used", str(res.data))

    # 8. Customer pays: status PAID, receipt created, notification sent
    def test_customer_pays_successfully(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="City A",
            destination="City B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("275.00"),
            status=Payment.Status.PAYMENT_INITIATED,
            qr_token="token_pay_success",
            qr_expires_at=timezone.now() + timedelta(minutes=10),
        )

        self.client.force_authenticate(user=self.customer1)
        res = self.client.post(f"/api/payments/{payment.id}/pay/", {"payment_method": "UPI"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PAID")
        self.assertIn("receipt_number", res.data)

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertTrue(payment.qr_used)
        self.assertIsNotNone(payment.paid_at)
        self.assertTrue(hasattr(payment, "receipt"))

        # Notification sent to customer
        cust_notif = Notification.objects.filter(user=self.customer1, title="Payment Successful")
        self.assertTrue(cust_notif.exists())

    # 9. Calling verify twice creates only one receipt
    def test_calling_verify_twice_is_idempotent(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("400.00"),
            status=Payment.Status.UNPAID,
        )
        ref = "TXN123456"
        sig = generate_gateway_signature(payment.id, ref, payment.amount, "SUCCESS")

        payload = {
            "payment_id": payment.id,
            "gateway_reference": ref,
            "gateway_status": "SUCCESS",
            "signature": sig,
        }

        self.client.force_authenticate(user=self.admin)
        res1 = self.client.post("/api/payments/verify/", payload)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        receipt_count_1 = Receipt.objects.filter(payment=payment).count()
        self.assertEqual(receipt_count_1, 1)

        # Second call
        res2 = self.client.post("/api/payments/verify/", payload)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        receipt_count_2 = Receipt.objects.filter(payment=payment).count()
        self.assertEqual(receipt_count_2, 1)

    def test_verify_endpoint_works_in_mock_gateway_mode_with_valid_signature(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("250.00"),
            status=Payment.Status.UNPAID,
        )
        ref = "TXN_MOCK_VERIFY_999"
        sig = generate_gateway_signature(payment.id, ref, payment.amount, "SUCCESS")

        payload = {
            "payment_id": payment.id,
            "gateway_reference": ref,
            "gateway_status": "SUCCESS",
            "signature": sig,
        }

        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/payments/verify/", payload)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("status"), "PAID")
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertEqual(payment.gateway_reference, ref)

    # 10. Wrong signature is rejected and the payment stays unpaid
    def test_wrong_signature_rejected(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("500.00"),
            status=Payment.Status.UNPAID,
        )

        payload = {
            "payment_id": payment.id,
            "gateway_reference": "TXN_INVALID",
            "gateway_status": "SUCCESS",
            "signature": "fake_invalid_signature_hex",
        }

        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/payments/verify/", payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid signature", str(res.data))

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.UNPAID)

    # 11. Forced gateway failure gives FAILED, then the driver can generate a new QR and the customer can pay successfully
    def test_forced_gateway_failure_and_recovery_flow(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("320.00"),
            status=Payment.Status.PAYMENT_INITIATED,
        )

        # Force failure
        set_force_gateway_failure(True)
        self.client.force_authenticate(user=self.customer1)
        res_fail = self.client.post(f"/api/payments/{payment.id}/pay/", {"payment_method": "CARD"})
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.FAILED)

        # Recovery: Driver generates a new QR code
        set_force_gateway_failure(False)
        self.client.force_authenticate(user=self.driver_user)
        res_new_qr = self.client.post(f"/api/payments/{payment.id}/generate-qr/")
        self.assertEqual(res_new_qr.status_code, status.HTTP_200_OK)
        new_token = res_new_qr.data["qr_token"]

        # Customer scans new QR
        self.client.force_authenticate(user=self.customer1)
        scan_res = self.client.post("/api/payments/scan/", {"qr_token": new_token})
        self.assertEqual(scan_res.status_code, status.HTTP_200_OK)

        # Customer pays successfully
        pay_res = self.client.post(f"/api/payments/{payment.id}/pay/", {"payment_method": "UPI"})
        self.assertEqual(pay_res.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)

    # 12. PDF receipt downloads
    def test_pdf_receipt_download(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="Bangalore",
            destination="Mysore",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
            start_odometer=100,
            end_odometer=240,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("2100.00"),
            status=Payment.Status.PAID,
            paid_at=timezone.now(),
            payment_method="UPI",
            gateway_reference="TXN98765",
        )
        Receipt.objects.create(
            payment=payment,
            receipt_number="FF-2026-000001",
            data={
                "customer_name": "Alice Customer",
                "route": "Bangalore to Mysore",
                "vehicle": "KA01PAY100",
                "driver": "Dave Driver",
                "distance_km": 140,
                "amount": "2100.00",
                "payment_method": "UPI",
                "gateway_reference": "TXN98765",
            },
        )

        self.client.force_authenticate(user=self.customer1)
        res_json = self.client.get(f"/api/payments/{payment.id}/receipt/")
        self.assertEqual(res_json.status_code, status.HTTP_200_OK)
        self.assertEqual(res_json.data["receipt_number"], "FF-2026-000001")

        res_pdf = self.client.get(f"/api/payments/{payment.id}/receipt/pdf/")
        self.assertEqual(res_pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pdf["content-type"], "application/pdf")
        self.assertTrue(len(res_pdf.content) > 100)

    # 13. Admin refund works, and a non-admin gets 403
    def test_admin_refund_flow_and_non_admin_blocked(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        payment = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("300.00"),
            status=Payment.Status.PAID,
            paid_at=timezone.now(),
        )

        # Fleet Manager tries refund -> 403 Forbidden
        self.client.force_authenticate(user=self.fleet_manager)
        res_mgr = self.client.post(f"/api/payments/{payment.id}/refund/")
        self.assertEqual(res_mgr.status_code, status.HTTP_403_FORBIDDEN)

        # Admin processes refund -> 200 OK
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.post(f"/api/payments/{payment.id}/refund/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        self.booking_car.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUNDED)
        self.assertEqual(self.booking_car.refund_status, Booking.RefundStatus.REFUNDED)

        # Customer notified of refund
        self.assertTrue(Notification.objects.filter(user=self.customer1, title="Payment Refunded").exists())

    # 14. Payment history and summary return the right data
    def test_payment_history_and_summary(self):
        trip = Trip.objects.create(
            booking=self.booking_car,
            vehicle=self.car,
            driver=self.driver,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        p1 = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("200.00"),
            status=Payment.Status.PAID,
        )
        p2 = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer1,
            amount=Decimal("100.00"),
            status=Payment.Status.UNPAID,
        )
        p3 = Payment.objects.create(
            booking=self.booking_car,
            trip=trip,
            customer=self.customer2,
            amount=Decimal("300.00"),
            status=Payment.Status.REFUNDED,
        )

        # Customer 1 history -> sees p1 and p2, not p3
        self.client.force_authenticate(user=self.customer1)
        res_hist = self.client.get("/api/payments/history/")
        self.assertEqual(res_hist.status_code, status.HTTP_200_OK)
        hist_ids = [p["id"] for p in res_hist.data["results"]]
        self.assertIn(p1.id, hist_ids)
        self.assertIn(p2.id, hist_ids)
        self.assertNotIn(p3.id, hist_ids)

        # Summary (Admin / Manager)
        self.client.force_authenticate(user=self.fleet_manager)
        res_sum = self.client.get("/api/payments/summary/")
        self.assertEqual(res_sum.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res_sum.data["total_collected"])), Decimal("200.00"))
        self.assertEqual(Decimal(str(res_sum.data["pending_amount"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(res_sum.data["refunded_amount"])), Decimal("300.00"))


def generate_test_image(filename="test_qr.png", color="blue"):
    file_io = BytesIO()
    image = Image.new("RGB", (100, 100), color=color)
    image.save(file_io, "PNG")
    file_io.seek(0)
    return SimpleUploadedFile(filename, file_io.read(), content_type="image/png")


@override_settings(PAYMENT_MODE="STATIC_QR")
class StaticQRPaymentTests(APITestCase):
    """Tests for the Static QR payment workflow."""

    def setUp(self):
        # Users
        self.admin = User.objects.create_superuser(
            email="admin_sqr@example.com",
            password="adminpassword123",
            full_name="Admin SQR",
        )
        self.fleet_manager = User.objects.create_user(
            email="manager_sqr@example.com",
            password="managerpassword123",
            full_name="Manager SQR",
            role=User.Role.FLEET_MANAGER,
        )
        self.customer1 = User.objects.create_user(
            email="cust1_sqr@example.com",
            password="custpassword123",
            full_name="Alice Customer SQR",
            role=User.Role.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email="cust2_sqr@example.com",
            password="custpassword123",
            full_name="Bob Customer SQR",
            role=User.Role.CUSTOMER,
        )
        self.driver_user = User.objects.create_user(
            email="driver_sqr@example.com",
            password="driverpassword123",
            full_name="Dave Driver SQR",
            role=User.Role.DRIVER,
        )
        self.driver = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-SQR-9999",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        # Vehicle
        self.car = Vehicle.objects.create(
            registration_number="KA01SQR123",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Honda",
            model="City",
            seating_capacity=4,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )

        # Booking & Trip
        self.booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            vehicle=self.car,
            pickup_location="Point A",
            drop_location="Point B",
            travel_datetime=timezone.now() + timedelta(days=1),
            passengers=2,
            estimated_distance_km=Decimal("20.00"),
            estimated_fare=Decimal("300.00"),
            status=Booking.Status.APPROVED,
        )
        self.trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.car,
            driver=self.driver,
            source="Point A",
            destination="Point B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
            start_odometer=1000,
            end_odometer=1020,
            total_fare=Decimal("300.00"),
        )
        self.payment = Payment.objects.create(
            booking=self.booking,
            trip=self.trip,
            customer=self.customer1,
            amount=Decimal("300.00"),
            status=Payment.Status.UNPAID,
        )

    # 1. Admin uploads QR image, customer reads from /qr-setting/ and /pay-info/
    def test_admin_uploads_qr_image_and_customer_reads_it(self):
        self.client.force_authenticate(user=self.admin)
        img = generate_test_image("qr_test.png")
        res_upload = self.client.post(
            "/api/payments/qr-setting/",
            {"title": "FleetFlow Official QR", "upi_id": "fleetflow@upi", "qr_image": img},
            format="multipart",
        )
        self.assertEqual(res_upload.status_code, status.HTTP_201_CREATED)
        self.assertIn("qr_image_url", res_upload.data)
        self.assertEqual(res_upload.data["title"], "FleetFlow Official QR")
        self.assertEqual(res_upload.data["upi_id"], "fleetflow@upi")

        # Customer reads from /qr-setting/
        self.client.force_authenticate(user=self.customer1)
        res_get_setting = self.client.get("/api/payments/qr-setting/")
        self.assertEqual(res_get_setting.status_code, status.HTTP_200_OK)
        self.assertEqual(res_get_setting.data["upi_id"], "fleetflow@upi")
        self.assertIsNotNone(res_get_setting.data["qr_image_url"])

        # Customer reads from /api/payments/{id}/pay-info/
        res_pay_info = self.client.get(f"/api/payments/{self.payment.id}/pay-info/")
        self.assertEqual(res_pay_info.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res_pay_info.data["amount"])), Decimal("300.00"))
        self.assertIn("payment_qr/", res_pay_info.data["qr_image_url"])
        self.assertTrue(res_pay_info.data["qr_image_url"].endswith(".png"))
        self.assertEqual(res_pay_info.data["driver_name"], "Dave Driver SQR")

    # 2. Wrong file type and file over 2 MB are rejected
    def test_wrong_file_type_and_large_file_rejected(self):
        self.client.force_authenticate(user=self.admin)

        # Wrong file format (BMP image named invalid.bmp)
        bmp_io = BytesIO()
        img = Image.new("RGB", (50, 50), color="red")
        img.save(bmp_io, "BMP")
        bmp_io.seek(0)
        bmp_file = SimpleUploadedFile("invalid_format.bmp", bmp_io.read(), content_type="image/bmp")
        res_bmp = self.client.post(
            "/api/payments/qr-setting/",
            {"title": "Invalid QR", "qr_image": bmp_file},
            format="multipart",
        )
        self.assertEqual(res_bmp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Allowed formats are PNG, JPG, JPEG, WEBP", str(res_bmp.data))

        # Oversized file (> 2 MB)
        large_io = BytesIO()
        large_img = Image.new("RGB", (2000, 2000), color="green")
        large_img.save(large_io, "PNG", compress_level=0)
        large_io.seek(0)
        large_file = SimpleUploadedFile("large_qr.png", large_io.read(), content_type="image/png")
        res_large = self.client.post(
            "/api/payments/qr-setting/",
            {"title": "Large QR", "qr_image": large_file},
            format="multipart",
        )
        self.assertEqual(res_large.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file size cannot exceed 2 MB", str(res_large.data))


    # 3. Customer submits transaction reference: PAYMENT_INITIATED and notifications sent
    def test_customer_submits_transaction_reference_and_notifications_sent(self):
        self.client.force_authenticate(user=self.customer1)
        res_submit = self.client.post(
            f"/api/payments/{self.payment.id}/submit-proof/",
            {"transaction_reference": "TXN9876543210"},
            format="multipart",
        )
        self.assertEqual(res_submit.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PAYMENT_INITIATED)
        self.assertEqual(self.payment.transaction_reference, "TXN9876543210")
        self.assertEqual(self.payment.payment_method, Payment.PaymentMethod.UPI)

        # Driver, Admin, and Manager received notification
        self.assertTrue(Notification.objects.filter(user=self.driver_user, title="Payment Proof Submitted").exists())
        self.assertTrue(Notification.objects.filter(user=self.admin, title="Payment Proof Submitted").exists())
        self.assertTrue(Notification.objects.filter(user=self.fleet_manager, title="Payment Proof Submitted").exists())

    # 4. Duplicate transaction reference is rejected
    def test_duplicate_transaction_reference_rejected(self):
        # Create another payment that already has reference TXN111222333
        trip2 = Trip.objects.create(
            booking=self.booking,
            vehicle=self.car,
            driver=self.driver,
            source="X",
            destination="Y",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
        )
        Payment.objects.create(
            booking=self.booking,
            trip=trip2,
            customer=self.customer2,
            amount=Decimal("150.00"),
            status=Payment.Status.PAYMENT_INITIATED,
            transaction_reference="TXN111222333",
        )

        self.client.force_authenticate(user=self.customer1)
        res_dup = self.client.post(
            f"/api/payments/{self.payment.id}/submit-proof/",
            {"transaction_reference": "TXN111222333"},
            format="multipart",
        )
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been used", str(res_dup.data))

    # 5. Another customer cannot see pay-info or submit proof (403)
    def test_another_customer_forbidden(self):
        self.client.force_authenticate(user=self.customer2)

        # Cannot access pay-info
        res_info = self.client.get(f"/api/payments/{self.payment.id}/pay-info/")
        self.assertEqual(res_info.status_code, status.HTTP_403_FORBIDDEN)

        # Cannot submit proof
        res_sub = self.client.post(
            f"/api/payments/{self.payment.id}/submit-proof/",
            {"transaction_reference": "TXN555666777"},
            format="multipart",
        )
        self.assertEqual(res_sub.status_code, status.HTTP_403_FORBIDDEN)

    # 6. Assigned driver confirms: status PAID, receipt created, customer notified
    def test_assigned_driver_confirms_payment(self):
        self.payment.status = Payment.Status.PAYMENT_INITIATED
        self.payment.transaction_reference = "TXN444555666"
        self.payment.save()

        self.client.force_authenticate(user=self.driver_user)
        res_conf = self.client.post(f"/api/payments/{self.payment.id}/confirm/")
        self.assertEqual(res_conf.status_code, status.HTTP_200_OK)

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PAID)
        self.assertIsNotNone(self.payment.paid_at)
        self.assertTrue(hasattr(self.payment, "receipt"))
        self.assertTrue(Notification.objects.filter(user=self.customer1, title="Payment Received").exists())

    # 7. Confirming twice creates only one receipt (idempotent)
    def test_confirming_twice_creates_only_one_receipt(self):
        self.payment.status = Payment.Status.PAYMENT_INITIATED
        self.payment.transaction_reference = "TXN777888999"
        self.payment.save()

        self.client.force_authenticate(user=self.driver_user)
        res_1 = self.client.post(f"/api/payments/{self.payment.id}/confirm/")
        self.assertEqual(res_1.status_code, status.HTTP_200_OK)
        receipt_count_1 = Receipt.objects.filter(payment=self.payment).count()
        self.assertEqual(receipt_count_1, 1)

        # Confirm second time
        res_2 = self.client.post(f"/api/payments/{self.payment.id}/confirm/")
        self.assertEqual(res_2.status_code, status.HTTP_200_OK)
        receipt_count_2 = Receipt.objects.filter(payment=self.payment).count()
        self.assertEqual(receipt_count_2, 1)

    # 8. Reject-proof sends payment back to UNPAID with reason and notification
    def test_reject_proof_reverts_to_unpaid(self):
        self.payment.status = Payment.Status.PAYMENT_INITIATED
        self.payment.transaction_reference = "TXN000111222"
        self.payment.save()

        self.client.force_authenticate(user=self.driver_user)
        res_rej = self.client.post(
            f"/api/payments/{self.payment.id}/reject-proof/",
            {"reason": "Amount not received in account"},
        )
        self.assertEqual(res_rej.status_code, status.HTTP_200_OK)

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.UNPAID)
        self.assertEqual(self.payment.failure_reason, "Amount not received in account")
        self.assertTrue(Notification.objects.filter(user=self.customer1, title="Payment Not Received").exists())

    # 9. Disabled mock gateway endpoints return 400 under STATIC_QR mode
    def test_disabled_mock_gateway_endpoints_return_400(self):
        self.client.force_authenticate(user=self.driver_user)
        res_gen = self.client.post(f"/api/payments/{self.payment.id}/generate-qr/")
        self.assertEqual(res_gen.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Not available in this payment mode", res_gen.data["detail"])

        self.client.force_authenticate(user=self.customer1)
        res_scan = self.client.post("/api/payments/scan/", {"qr_token": "anytoken"})
        self.assertEqual(res_scan.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Not available in this payment mode", res_scan.data["detail"])

        res_pay = self.client.post(f"/api/payments/{self.payment.id}/pay/", {"payment_method": "UPI"})
        self.assertEqual(res_pay.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Not available in this payment mode", res_pay.data["detail"])

        res_verify = self.client.post("/api/payments/verify/", {
            "payment_id": self.payment.id,
            "gateway_reference": "TXN_MOCK_REF",
            "gateway_status": "SUCCESS",
            "signature": "mock_signature_hex",
        })
        self.assertEqual(res_verify.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_verify.data["detail"], "Not available in this payment mode.")

    def test_verify_endpoint_returns_400_in_static_qr_mode(self):
        self.client.force_authenticate(user=self.admin)
        # Rejection occurs before serializer validation: even empty payload returns 400
        res_empty = self.client.post("/api/payments/verify/", {})
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_empty.data["detail"], "Not available in this payment mode.")

        # Full payload also returns 400 with exact detail message
        payload = {
            "payment_id": self.payment.id,
            "gateway_reference": "TXN_MOCK_REF",
            "gateway_status": "SUCCESS",
            "signature": "mock_signature_hex",
        }
        res_full = self.client.post("/api/payments/verify/", payload)
        self.assertEqual(res_full.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_full.data["detail"], "Not available in this payment mode.")


@override_settings(PAYMENT_MODE="STATIC_QR")
class PaymentProofSecurityTests(APITestCase):
    """Targeted security tests for Payment Proof screenshot access & storage."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin_sec@example.com",
            password="adminpassword123",
            full_name="Admin Sec",
        )
        self.fleet_manager = User.objects.create_user(
            email="manager_sec@example.com",
            password="managerpassword123",
            full_name="Manager Sec",
            role=User.Role.FLEET_MANAGER,
        )
        self.customer1 = User.objects.create_user(
            email="cust1_sec@example.com",
            password="custpassword123",
            full_name="Alice Sec",
            role=User.Role.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email="cust2_sec@example.com",
            password="custpassword123",
            full_name="Bob Sec",
            role=User.Role.CUSTOMER,
        )
        self.driver_user = User.objects.create_user(
            email="driver_sec@example.com",
            password="driverpassword123",
            full_name="Dave Driver Sec",
            role=User.Role.DRIVER,
        )
        self.driver = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-SEC-1111",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )
        self.other_driver_user = User.objects.create_user(
            email="other_driver_sec@example.com",
            password="driverpassword123",
            full_name="Other Driver Sec",
            role=User.Role.DRIVER,
        )
        self.other_driver = Driver.objects.create(
            user=self.other_driver_user,
            license_number="DL-SEC-2222",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        self.car = Vehicle.objects.create(
            registration_number="KA01SEC999",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Honda",
            model="City",
            seating_capacity=4,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            vehicle=self.car,
            pickup_location="Point A",
            drop_location="Point B",
            travel_datetime=timezone.now() + timedelta(days=1),
            passengers=2,
            estimated_distance_km=Decimal("20.00"),
            estimated_fare=Decimal("300.00"),
            status=Booking.Status.APPROVED,
        )
        self.trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.car,
            driver=self.driver,
            source="Point A",
            destination="Point B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
            start_odometer=1000,
            end_odometer=1020,
            total_fare=Decimal("300.00"),
        )
        self.payment = Payment.objects.create(
            booking=self.booking,
            trip=self.trip,
            customer=self.customer1,
            amount=Decimal("300.00"),
            status=Payment.Status.UNPAID,
        )

    def test_unauthenticated_proof_access_rejected(self):
        # 1. Unauthenticated request to /api/payments/{id}/proof/ -> 401
        res = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthorized_customer_cannot_access_proof(self):
        # Customer2 cannot access Customer1's proof
        self.client.force_authenticate(user=self.customer2)
        res = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_unauthorized_driver_cannot_access_proof(self):
        # Driver not assigned to trip cannot access proof
        self.client.force_authenticate(user=self.other_driver_user)
        res = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_missing_proof_returns_404(self):
        # Payment has no proof screenshot attached
        self.client.force_authenticate(user=self.customer1)
        res = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_proof_upload_and_authorized_access_all_roles(self):
        # Customer1 uploads proof screenshot
        self.client.force_authenticate(user=self.customer1)
        proof_img = generate_test_image("my_proof.png", color="green")
        res_upload = self.client.post(
            f"/api/payments/{self.payment.id}/submit-proof/",
            {"transaction_reference": "TXNSEC001122", "proof_screenshot": proof_img},
            format="multipart",
        )
        self.assertEqual(res_upload.status_code, status.HTTP_200_OK)

        self.payment.refresh_from_db()
        self.assertTrue(bool(self.payment.proof_screenshot))

        # Check serializer returns protected URL, not direct media URL
        serializer_data = res_upload.data
        self.assertIn(f"/api/payments/{self.payment.id}/proof/", serializer_data["proof_screenshot"])
        self.assertNotIn("/media/payment_proofs/", serializer_data["proof_screenshot"])

        # 1. Paying customer can access proof
        self.client.force_authenticate(user=self.customer1)
        res_cust = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertEqual(res_cust.status_code, status.HTTP_200_OK)
        self.assertEqual(res_cust["Content-Type"], "image/png")
        if hasattr(res_cust, "close"):
            res_cust.close()

        # 2. Assigned driver can access proof
        self.client.force_authenticate(user=self.driver_user)
        res_drv = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertEqual(res_drv.status_code, status.HTTP_200_OK)
        if hasattr(res_drv, "close"):
            res_drv.close()

        # 3. Fleet manager can access proof
        self.client.force_authenticate(user=self.fleet_manager)
        res_mgr = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)
        if hasattr(res_mgr, "close"):
            res_mgr.close()

        # 4. Superuser / Admin can access proof
        self.client.force_authenticate(user=self.admin)
        res_adm = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertEqual(res_adm.status_code, status.HTTP_200_OK)
        if hasattr(res_adm, "close"):
            res_adm.close()

    def test_legacy_fallback_when_file_only_in_media_root(self):
        from django.core.files.storage import default_storage
        from core.upload_security import private_file_storage

        # Save dummy image only into default_storage (MEDIA_ROOT)
        legacy_filename = "payment_proofs/legacy_test_proof.png"
        img = generate_test_image("legacy.png")
        if not default_storage.exists(legacy_filename):
            default_storage.save(legacy_filename, img)

        # Ensure it does not exist in private storage
        if private_file_storage.exists(legacy_filename):
            private_file_storage.delete(legacy_filename)

        self.payment.proof_screenshot.name = legacy_filename
        self.payment.save(update_fields=["proof_screenshot"])

        # Payer requests proof -> fallback should serve it from default_storage
        self.client.force_authenticate(user=self.customer1)
        res = self.client.get(f"/api/payments/{self.payment.id}/proof/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        if hasattr(res, "close"):
            res.close()

        # Clean up test legacy file from default_storage
        if default_storage.exists(legacy_filename):
            try:
                default_storage.delete(legacy_filename)
            except Exception:
                pass

    def test_public_qr_image_access_preserved(self):
        # Admin uploads QR
        self.client.force_authenticate(user=self.admin)
        img = generate_test_image("qr_sec.png")
        res_upload = self.client.post(
            "/api/payments/qr-setting/",
            {"title": "Secured Public QR", "upi_id": "sec@upi", "qr_image": img},
            format="multipart",
        )
        self.assertEqual(res_upload.status_code, status.HTTP_201_CREATED)
        qr_url = res_upload.data["qr_image_url"]
        self.assertIn("/media/payment_qr/", qr_url)

        # Customer reads QR info
        self.client.force_authenticate(user=self.customer1)
        res_get = self.client.get("/api/payments/qr-setting/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertEqual(res_get.data["qr_image_url"], qr_url)

        # Customer cannot upload or modify QR setting (403 Forbidden)
        res_cust_post = self.client.post(
            "/api/payments/qr-setting/",
            {"title": "Hacked QR", "upi_id": "hack@upi", "qr_image": img},
            format="multipart",
        )
        self.assertEqual(res_cust_post.status_code, status.HTTP_403_FORBIDDEN)


class PaymentGatewaySecretSecurityTests(APITestCase):
    """Targeted tests for PAYMENT_GATEWAY_SECRET security and signature verification."""

    @override_settings(PAYMENT_GATEWAY_SECRET="x" * 64)
    def test_signature_generation_and_verification_with_valid_secret(self):
        payment_id = 42
        ref = "TXNVALID12345"
        amount = Decimal("150.00")
        status_val = "SUCCESS"

        sig = generate_gateway_signature(payment_id, ref, amount, status_val)
        self.assertEqual(len(sig), 64)  # SHA-256 hex digest length
        self.assertTrue(verify_gateway_signature(payment_id, ref, amount, status_val, sig))

    @override_settings(PAYMENT_GATEWAY_SECRET="x" * 64)
    def test_tampered_payload_rejected_by_verify_signature(self):
        payment_id = 42
        ref = "TXNVALID12345"
        amount = Decimal("150.00")
        status_val = "SUCCESS"

        sig = generate_gateway_signature(payment_id, ref, amount, status_val)

        # Alter amount
        self.assertFalse(verify_gateway_signature(payment_id, ref, Decimal("151.00"), status_val, sig))
        # Alter payment_id
        self.assertFalse(verify_gateway_signature(99, ref, amount, status_val, sig))
        # Alter status
        self.assertFalse(verify_gateway_signature(payment_id, ref, amount, "FAILED", sig))
        # Alter reference
        self.assertFalse(verify_gateway_signature(payment_id, "TXNTAMPERED", amount, status_val, sig))
        # Alter signature
        self.assertFalse(verify_gateway_signature(payment_id, ref, amount, status_val, sig[:-4] + "0000"))

    @override_settings(PAYMENT_GATEWAY_SECRET="")
    def test_signature_generation_fails_fast_when_secret_not_configured(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            generate_gateway_signature(1, "TXN123", Decimal("10.00"), "SUCCESS")
        self.assertIn("PAYMENT_GATEWAY_SECRET is not configured", str(ctx.exception))

        with self.assertRaises(ImproperlyConfigured) as ctx:
            verify_gateway_signature(1, "TXN123", Decimal("10.00"), "SUCCESS", "anysig")
        self.assertIn("PAYMENT_GATEWAY_SECRET is not configured", str(ctx.exception))

    def test_different_secrets_produce_different_signatures(self):
        with override_settings(PAYMENT_GATEWAY_SECRET="secret_alpha_" + "a" * 40):
            sig1 = generate_gateway_signature(1, "TXN123", Decimal("50.00"), "SUCCESS")

        with override_settings(PAYMENT_GATEWAY_SECRET="secret_beta__" + "b" * 40):
            sig2 = generate_gateway_signature(1, "TXN123", Decimal("50.00"), "SUCCESS")

        self.assertNotEqual(sig1, sig2)

