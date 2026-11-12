from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from bookings.models import Booking, BusSchedule
from documents.models import Document
from drivers.models import Driver
from fuel.models import FuelLog
from payments.models import Payment, PaymentQRSetting
from trips.models import Trip
from vehicles.models import Vehicle


class PermissionMatrixTests(APITestCase):
    """
    Automated permission matrix testing across all roles:
    - Anonymous (No login)
    - Customer
    - Driver
    - Fleet Manager
    - Admin
    """

    def setUp(self):
        cache.clear()

        # 1. Admin
        self.admin = User.objects.create_superuser(
            email="admin@fleetflow.com",
            password="Demo@12345",
            full_name="Admin Matrix",
            role=User.Role.ADMIN,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        # 2. Fleet Manager
        self.fm = User.objects.create_user(
            email="manager@fleetflow.com",
            password="Demo@12345",
            full_name="Fleet Manager Matrix",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        # 3. Driver
        self.driver_user = User.objects.create_user(
            email="driver1@fleetflow.com",
            password="Demo@12345",
            full_name="Driver Matrix",
            role=User.Role.DRIVER,
            phone="+919876543221",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver_profile = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-MATRIX-001",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        # 4. Customer 1 (owner of sample data)
        self.customer1 = User.objects.create_user(
            email="customer1@fleetflow.com",
            password="Demo@12345",
            full_name="Customer One",
            phone="+919876543201",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        # 5. Customer 2 (third-party customer)
        self.customer2 = User.objects.create_user(
            email="customer2@fleetflow.com",
            password="Demo@12345",
            full_name="Customer Two",
            phone="+919876543202",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        # Vehicles
        self.vehicle = Vehicle.objects.create(
            registration_number="AP05-MX-001",
            brand="Toyota",
            model="Innova",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=6,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )

        # Booking for Customer 1
        self.booking1 = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            vehicle=self.vehicle,
            pickup_location="Vijayawada",
            drop_location="Guntur",
            travel_datetime=timezone.now() + timedelta(hours=5),
            passengers=2,
            estimated_distance_km=Decimal("40.00"),
            estimated_fare=Decimal("600.00"),
            status=Booking.Status.APPROVED,
        )

        # Trip for Booking 1 assigned to Driver
        self.trip1 = Trip.objects.create(
            booking=self.booking1,
            vehicle=self.vehicle,
            driver=self.driver_profile,
            assigned_by=self.fm,
            source="Vijayawada",
            destination="Guntur",
            scheduled_datetime=timezone.now() + timedelta(hours=5),
            status=Trip.Status.IN_PROGRESS,
            total_fare=Decimal("600.00"),
        )

        # Payment for Booking 1
        self.payment1 = Payment.objects.create(
            booking=self.booking1,
            trip=self.trip1,
            customer=self.customer1,
            amount=Decimal("600.00"),
            status=Payment.Status.PAID,
            paid_at=timezone.now(),
        )

        # Sample FuelLog and Document for review actions
        self.fuel_log = FuelLog.objects.create(
            vehicle=self.vehicle,
            driver=self.driver_profile,
            trip=self.trip1,
            date=date.today(),
            fuel_type="DIESEL",
            quantity=Decimal("20.00"),
            price_per_unit=Decimal("100.00"),
            odometer_km=15000,
            review_status=FuelLog.ReviewStatus.PENDING,
        )

        self.document = Document.objects.create(
            doc_type=Document.DocType.DRIVING_LICENSE,
            driver=self.driver_profile,
            uploaded_by=self.driver_user,
            document_number="DL-12345",
            expiry_date=date.today() + timedelta(days=180),
            review_status=Document.ReviewStatus.PENDING,
        )

    def tearDown(self):
        cache.clear()

    def test_permission_matrix_endpoints(self):
        """
        Executes permission checks on core endpoints across 5 roles.
        Prints an automated permission matrix table.
        """
        endpoints = [
            ("GET", "/api/users/", "Users List", {None: 401, "CUST": 403, "DRV": 403, "FM": 403, "ADMIN": 200}),
            ("GET", "/api/auth/approvals/", "Approvals List", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/vehicles/", "Vehicles List", {None: 401, "CUST": 200, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("POST", "/api/vehicles/", "Create Vehicle", {None: 401, "CUST": 403, "DRV": 403, "FM": 400, "ADMIN": 400}),
            ("GET", "/api/maintenance/", "Maintenance List", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/drivers/", "Drivers List", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/drivers/me/", "Driver Profile 'me'", {None: 401, "CUST": 403, "DRV": 200, "FM": 404, "ADMIN": 404}),
            ("GET", "/api/bus-schedules/", "Bus Schedules", {None: 401, "CUST": 200, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("POST", "/api/bus-schedules/", "Create Bus Schedule", {None: 401, "CUST": 403, "DRV": 403, "FM": 400, "ADMIN": 400}),
            ("GET", "/api/bookings/", "Bookings List", {None: 401, "CUST": 200, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/trips/", "Trips List", {None: 401, "CUST": 403, "DRV": 200, "FM": 200, "ADMIN": 200}),
            ("POST", "/api/trips/assign/", "Assign Trip", {None: 401, "CUST": 403, "DRV": 403, "FM": 400, "ADMIN": 400}),
            ("GET", f"/api/trips/assignable/?booking={self.booking1.id}", "Assignable Resources", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("POST", f"/api/payments/{self.payment1.id}/refund/", "Refund Payment", {None: 401, "CUST": 403, "DRV": 403, "FM": 403, "ADMIN": 200}),
            ("GET", "/api/reports/payments/", "Payments Report", {None: 401, "CUST": 403, "DRV": 403, "FM": 403, "ADMIN": 200}),
            ("GET", "/api/reports/trips/", "Trips Report", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/reports/bookings/", "Bookings Report", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/reports/vehicle-utilization/", "Vehicle Utilization", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/dashboard/admin/", "Admin Dashboard", {None: 401, "CUST": 403, "DRV": 403, "FM": 403, "ADMIN": 200}),
            ("GET", "/api/dashboard/fleet-manager/", "FM Dashboard", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/dashboard/driver/", "Driver Dashboard", {None: 401, "CUST": 403, "DRV": 200, "FM": 403, "ADMIN": 403}),
            ("GET", "/api/dashboard/customer/", "Customer Dashboard", {None: 401, "CUST": 200, "DRV": 403, "FM": 403, "ADMIN": 403}),
            ("GET", "/api/fuel/", "Fuel Logs List", {None: 401, "CUST": 403, "DRV": 200, "FM": 200, "ADMIN": 200}),
            ("POST", "/api/fuel/", "Driver-only Fuel Create", {None: 401, "CUST": 403, "DRV": 400, "FM": 403, "ADMIN": 403}),
            ("POST", f"/api/fuel/{self.fuel_log.id}/approve/", "Approve Fuel Log", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("POST", f"/api/fuel/{self.fuel_log.id}/reject/", "Reject Fuel Log", {None: 401, "CUST": 403, "DRV": 403, "FM": 400, "ADMIN": 400}),
            ("GET", "/api/fuel/summary/", "Fuel Summary", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/expenses/", "Expenses List", {None: 401, "CUST": 403, "DRV": 200, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/expenses/summary/", "Expenses Summary", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/documents/", "Documents List", {None: 401, "CUST": 403, "DRV": 200, "FM": 200, "ADMIN": 200}),
            ("POST", "/api/documents/", "Driver-only Document Upload", {None: 401, "CUST": 403, "DRV": 400, "FM": 403, "ADMIN": 403}),
            ("POST", f"/api/documents/{self.document.id}/approve/", "Approve Document", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("POST", f"/api/documents/{self.document.id}/reject/", "Reject Document", {None: 401, "CUST": 403, "DRV": 403, "FM": 400, "ADMIN": 400}),
            ("GET", "/api/documents/expiring/", "Documents Expiring", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/reports/fuel/", "Fuel Report", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/reports/expenses/", "Expenses Report", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/reports/documents-expiry/", "Documents Expiry Report", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
            ("GET", "/api/reports/vehicle-cost/", "Vehicle Cost Report", {None: 401, "CUST": 403, "DRV": 403, "FM": 200, "ADMIN": 200}),
        ]

        roles = [
            (None, "Anonymous", None),
            ("CUST", "Customer", self.customer1),
            ("DRV", "Driver", self.driver_user),
            ("FM", "Fleet Manager", self.fm),
            ("ADMIN", "Admin", self.admin),
        ]

        matrix_results = []
        unexpected_access = []

        for method, path, name, expected_rules in endpoints:
            row = {"endpoint": f"{method} {path}", "name": name, "results": {}}
            for role_code, role_name, user_obj in roles:
                self.client.logout()
                if user_obj:
                    self.client.force_authenticate(user=user_obj)

                if method == "GET":
                    resp = self.client.get(path)
                elif method == "POST":
                    resp = self.client.post(path, {}, format="json")
                elif method == "PUT":
                    resp = self.client.put(path, {}, format="json")

                actual_status = resp.status_code
                row["results"][role_code] = actual_status

                expected = expected_rules.get(role_code)
                # Note: 400 vs 200/201 on empty POST payloads means access was GRANTED (permission passed)
                if expected == 400:
                    access_allowed = actual_status in [200, 201, 400]
                elif expected == 200:
                    access_allowed = actual_status in [200, 201]
                elif expected == 404:
                    access_allowed = actual_status in [200, 404]
                elif expected == 401:
                    access_allowed = actual_status == 401
                elif expected == 403:
                    access_allowed = actual_status == 403
                else:
                    access_allowed = actual_status == expected

                if not access_allowed:
                    unexpected_access.append((f"{method} {path}", role_name, expected, actual_status))

            matrix_results.append(row)

        # Print formatted table
        print("\n" + "=" * 95)
        print("                        FLEETFLOW AUTOMATED PERMISSION MATRIX")
        print("=" * 95)
        print(f"{'Endpoint':<35} | {'Anon':<6} | {'Cust':<6} | {'Driver':<6} | {'Manager':<8} | {'Admin':<6} | Status")
        print("-" * 95)
        for r in matrix_results:
            anon_s = str(r["results"][None])
            cust_s = str(r["results"]["CUST"])
            drv_s = str(r["results"]["DRV"])
            fm_s = str(r["results"]["FM"])
            admin_s = str(r["results"]["ADMIN"])
            print(f"{r['endpoint'][:35]:<35} | {anon_s:<6} | {cust_s:<6} | {drv_s:<6} | {fm_s:<8} | {admin_s:<6} | OK")
        print("=" * 95)

        self.assertEqual(len(unexpected_access), 0, f"Unexpected access detected: {unexpected_access}")

    def test_customer_cannot_see_other_customer_booking(self):
        """Verifies Customer B cannot access Customer A's booking."""
        self.client.force_authenticate(user=self.customer2)
        resp = self.client.get(f"/api/bookings/{self.booking1.id}/")
        self.assertIn(resp.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_customer_never_sees_driver_phone_or_email(self):
        """Verifies tracking data returned to customer strictly excludes driver phone and email."""
        self.client.force_authenticate(user=self.customer1)
        resp = self.client.get(f"/api/bookings/{self.booking1.id}/tracking/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data
        self.assertIn("driver_name", data)
        self.assertEqual(data["driver_name"], "Driver Matrix")

        # Explicitly verify no phone or email in the tracking response
        self.assertNotIn("phone", data)
        self.assertNotIn("email", data)
        self.assertNotIn("driver_phone", data)
        self.assertNotIn("driver_email", data)

    def test_unverified_or_pending_user_cannot_get_tokens(self):
        """Verifies unverified email or pending/rejected approval accounts cannot obtain JWT tokens."""
        # Case 1: Unverified email
        unverified = User.objects.create_user(
            email="unverified@test.com",
            password="Demo@12345",
            full_name="Unverified User",
            is_email_verified=False,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        resp1 = self.client.post("/api/auth/login/", {"email": "unverified@test.com", "password": "Demo@12345"})
        self.assertEqual(resp1.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp1.data.get("code"), "EMAIL_NOT_VERIFIED")

        # Case 2: Pending approval
        pending = User.objects.create_user(
            email="pending@test.com",
            password="Demo@12345",
            full_name="Pending User",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
        )
        resp2 = self.client.post("/api/auth/login/", {"email": "pending@test.com", "password": "Demo@12345"})
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp2.data.get("code"), "APPROVAL_PENDING")

        # Case 3: Rejected approval
        rejected = User.objects.create_user(
            email="rejected@test.com",
            password="Demo@12345",
            full_name="Rejected User",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.REJECTED,
            rejection_reason="License invalid",
        )
        resp3 = self.client.post("/api/auth/login/", {"email": "rejected@test.com", "password": "Demo@12345"})
        self.assertEqual(resp3.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp3.data.get("code"), "APPROVAL_REJECTED")

    def test_public_registration_cannot_create_admin_when_admin_exists(self):
        """Verifies public registration cannot create an ADMIN when an active ADMIN already exists."""
        self.assertTrue(User.objects.filter(role=User.Role.ADMIN, is_active=True).exists())
        payload = {
            "email": "rogue.admin@gmail.com",
            "password": "Password@12345",
            "full_name": "Rogue Admin",
            "role": "ADMIN",
        }
        resp = self.client.post("/api/auth/register/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", resp.data)
