from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from bookings.models import Booking, BusSchedule
from drivers.models import Driver
from notifications.models import Notification
from payments.models import Payment
from trips.models import Trip
from vehicles.models import Vehicle, Maintenance
from fuel.models import FuelLog
from expenses.models import Expense
from documents.models import Document


class Stage7TestSuite(APITestCase):
    def setUp(self):
        # 1. Users
        self.admin = User.objects.create_superuser(
            email="admin_stage7@fleetflow.com",
            password="Password123!",
            full_name="Admin Stage7",
        )
        self.fleet_manager = User.objects.create_user(
            email="manager_stage7@fleetflow.com",
            password="Password123!",
            full_name="Fleet Manager Stage7",
            role=User.Role.FLEET_MANAGER,
        )
        self.customer = User.objects.create_user(
            email="customer_stage7@fleetflow.com",
            password="Password123!",
            full_name="Customer Stage7",
            role=User.Role.CUSTOMER,
        )
        self.driver_user = User.objects.create_user(
            email="driver_stage7@fleetflow.com",
            password="Password123!",
            full_name="Driver Stage7",
            role=User.Role.DRIVER,
        )
        self.driver_profile = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-STAGE7-001",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        # 2. Vehicles
        self.vehicle_car = Vehicle.objects.create(
            registration_number="AP 05 TEST 1111",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Hyundai",
            model="Verna",
            seating_capacity=4,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.vehicle_bus = Vehicle.objects.create(
            registration_number="AP 05 TEST 2222",
            vehicle_type=Vehicle.VehicleType.BUS,
            brand="Tata",
            model="Starbus",
            seating_capacity=30,
            min_passengers=10,
            rate_per_km=Decimal("40.00"),
            status=Vehicle.Status.ACTIVE,
        )

    # -------------------------------------------------------------------------
    # Test 1 & 2: Users & Roles Management
    # -------------------------------------------------------------------------
    def test_admin_creates_fleet_manager_user_and_fleet_manager_cannot_call_users_endpoint(self):
        # Fleet Manager cannot call /api/users/ (403)
        self.client.force_authenticate(user=self.fleet_manager)
        res = self.client.get("/api/users/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Admin creates Fleet Manager user
        self.client.force_authenticate(user=self.admin)
        payload = {
            "email": "new_fm@fleetflow.com",
            "full_name": "New Fleet Manager",
            "phone": "+919999988888",
            "password": "Password123!",
            "role": User.Role.FLEET_MANAGER,
        }
        res_post = self.client.post("/api/users/", payload)
        self.assertEqual(res_post.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_post.data["email"], "new_fm@fleetflow.com")
        self.assertEqual(res_post.data["role"], User.Role.FLEET_MANAGER)
        self.assertTrue(res_post.data.get("is_email_verified"))
        self.assertEqual(res_post.data.get("approval_status"), User.ApprovalStatus.APPROVED)

        # Confirm newly created user can log in
        self.client.logout()
        res_login = self.client.post("/api/auth/login/", {
            "email": "new_fm@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_login.status_code, status.HTTP_200_OK)

    def test_admin_cannot_deactivate_or_change_role_of_own_account(self):
        self.client.force_authenticate(user=self.admin)

        # Cannot deactivate own account
        res_deact = self.client.post(f"/api/users/{self.admin.id}/deactivate/")
        self.assertEqual(res_deact.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("own account", res_deact.data["detail"])

        # Cannot change role of own account
        res_patch = self.client.patch(f"/api/users/{self.admin.id}/", {"role": User.Role.CUSTOMER})
        self.assertEqual(res_patch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("own role", res_patch.data["detail"])

        # Cannot delete users
        res_del = self.client.delete(f"/api/users/{self.admin.id}/")
        self.assertEqual(res_del.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_deactivated_user_cannot_login(self):
        # Admin deactivates customer
        self.client.force_authenticate(user=self.admin)
        res_deact = self.client.post(f"/api/users/{self.customer.id}/deactivate/")
        self.assertEqual(res_deact.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_active)

        # Login attempt
        self.client.logout()
        res_login = self.client.post("/api/auth/login/", {
            "email": self.customer.email,
            "password": "Password123!",
        })
        self.assertEqual(res_login.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid email/phone or password.", str(res_login.data))

    # -------------------------------------------------------------------------
    # Test 3: Maintenance Rules
    # -------------------------------------------------------------------------
    def test_maintenance_state_transitions_and_on_trip_blocked(self):
        self.client.force_authenticate(user=self.admin)

        # 1. Create maintenance in SCHEDULED
        maint_data = {
            "vehicle": self.vehicle_car.id,
            "title": "Brake Replacement",
            "description": "Brake pad replacement",
            "scheduled_date": (date.today() + timedelta(days=2)).isoformat(),
            "status": Maintenance.Status.SCHEDULED,
        }
        res_m = self.client.post("/api/maintenance/", maint_data)
        self.assertEqual(res_m.status_code, status.HTTP_201_CREATED)
        m_id = res_m.data["id"]

        # 2. Update to IN_PROGRESS -> changes vehicle to MAINTENANCE
        res_prog = self.client.patch(f"/api/maintenance/{m_id}/", {"status": Maintenance.Status.IN_PROGRESS})
        self.assertEqual(res_prog.status_code, status.HTTP_200_OK)
        self.vehicle_car.refresh_from_db()
        self.assertEqual(self.vehicle_car.status, Vehicle.Status.MAINTENANCE)

        # Confirm vehicle in maintenance cannot be assigned to a trip
        trip_assign_payload = {
            "vehicle": self.vehicle_car.id,
            "driver": self.driver_profile.id,
            "source": "Kakinada",
            "destination": "Rajahmundry",
            "scheduled_datetime": (timezone.now() + timedelta(days=1)).isoformat(),
        }
        res_trip_fail = self.client.post("/api/trips/assign/", trip_assign_payload)
        self.assertEqual(res_trip_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Update to COMPLETED -> vehicle reverts to ACTIVE
        res_comp = self.client.patch(f"/api/maintenance/{m_id}/", {"status": Maintenance.Status.COMPLETED})
        self.assertEqual(res_comp.status_code, status.HTTP_200_OK)
        self.vehicle_car.refresh_from_db()
        self.assertEqual(self.vehicle_car.status, Vehicle.Status.ACTIVE)

        # 4. Vehicle ON_TRIP cannot start maintenance
        self.vehicle_car.status = Vehicle.Status.ON_TRIP
        self.vehicle_car.save()

        res_ontrip_m = self.client.post("/api/maintenance/", {
            "vehicle": self.vehicle_car.id,
            "title": "Oil Change",
            "scheduled_date": date.today().isoformat(),
            "status": Maintenance.Status.IN_PROGRESS,
        })
        self.assertEqual(res_ontrip_m.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ON_TRIP cannot start maintenance", str(res_ontrip_m.data))

    # -------------------------------------------------------------------------
    # Test 4: Maintenance Alerts Command (No Duplicate Alerts)
    # -------------------------------------------------------------------------
    def test_maintenance_alerts_does_not_send_duplicate_alerts(self):
        # Create scheduled maintenance within next 2 days
        maint = Maintenance.objects.create(
            vehicle=self.vehicle_bus,
            title="Suspension Check",
            scheduled_date=date.today() + timedelta(days=1),
            status=Maintenance.Status.SCHEDULED,
            created_by=self.fleet_manager,
        )

        out = StringIO()
        # First execution
        call_command("maintenance_alerts", stdout=out)
        self.assertIn("processed maintenance alerts for 1 vehicles", out.getvalue())

        maint.refresh_from_db()
        self.assertTrue(maint.alert_sent)

        # Verify notifications created for Admin and Fleet Manager
        admin_notifications = Notification.objects.filter(user=self.admin, type=Notification.NotificationType.VEHICLE)
        fm_notifications = Notification.objects.filter(user=self.fleet_manager, type=Notification.NotificationType.VEHICLE)
        self.assertEqual(admin_notifications.count(), 1)
        self.assertEqual(fm_notifications.count(), 1)

        # Second execution (should not send duplicates)
        out2 = StringIO()
        call_command("maintenance_alerts", stdout=out2)
        self.assertIn("processed maintenance alerts for 0 vehicles", out2.getvalue())
        self.assertEqual(admin_notifications.count(), 1)
        self.assertEqual(fm_notifications.count(), 1)

    # -------------------------------------------------------------------------
    # Test 5: Dashboards Metrics & Role Restrictions
    # -------------------------------------------------------------------------
    def test_dashboards_metrics_and_role_access(self):
        # 1. Admin dashboard
        self.client.force_authenticate(user=self.admin)
        res_admin_dash = self.client.get("/api/dashboard/admin/")
        self.assertEqual(res_admin_dash.status_code, status.HTTP_200_OK)
        self.assertIn("total_vehicles", res_admin_dash.data)
        self.assertIn("pending_approvals", res_admin_dash.data)
        self.assertIn("revenue", res_admin_dash.data)
        self.assertIn("revenue_last_6_months", res_admin_dash.data)

        # Admin gets 403 on Customer and Driver dashboards
        self.assertEqual(self.client.get("/api/dashboard/customer/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/dashboard/driver/").status_code, status.HTTP_403_FORBIDDEN)

        # 2. Fleet Manager dashboard
        self.client.force_authenticate(user=self.fleet_manager)
        res_fm_dash = self.client.get("/api/dashboard/fleet-manager/")
        self.assertEqual(res_fm_dash.status_code, status.HTTP_200_OK)
        self.assertIn("active_trips", res_fm_dash.data)
        self.assertIn("pending_approvals", res_fm_dash.data)
        self.assertIn("pending_driver_requests", res_fm_dash.data)
        self.assertIn("bus_bookings_due", res_fm_dash.data)

        # Fleet Manager gets 403 on Admin, Customer, and Driver dashboards
        self.assertEqual(self.client.get("/api/dashboard/admin/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/dashboard/customer/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/dashboard/driver/").status_code, status.HTTP_403_FORBIDDEN)

        # 3. Customer dashboard
        self.client.force_authenticate(user=self.customer)
        res_cust_dash = self.client.get("/api/dashboard/customer/")
        self.assertEqual(res_cust_dash.status_code, status.HTTP_200_OK)
        self.assertIn("total_bookings", res_cust_dash.data)
        self.assertIn("pending_payments", res_cust_dash.data)

        # Customer gets 403 on Admin, Fleet Manager, and Driver dashboards
        self.assertEqual(self.client.get("/api/dashboard/admin/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/dashboard/fleet-manager/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/dashboard/driver/").status_code, status.HTTP_403_FORBIDDEN)

        # 4. Driver dashboard
        self.client.force_authenticate(user=self.driver_user)
        res_driver_dash = self.client.get("/api/dashboard/driver/")
        self.assertEqual(res_driver_dash.status_code, status.HTTP_200_OK)
        self.assertIn("todays_trips", res_driver_dash.data)
        self.assertIn("total_distance_km", res_driver_dash.data)

        # Driver gets 403 on Admin, Fleet Manager, and Customer dashboards
        self.assertEqual(self.client.get("/api/dashboard/admin/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/dashboard/fleet-manager/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/dashboard/customer/").status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # Test 6 & 7: Reports, Date Filtering, CSV Export, Permissions
    # -------------------------------------------------------------------------
    def test_reports_filter_by_date_and_csv_export(self):
        self.client.force_authenticate(user=self.admin)

        # JSON response
        res_json = self.client.get("/api/reports/bookings/?date_from=2026-01-01&date_to=2026-12-31")
        self.assertEqual(res_json.status_code, status.HTTP_200_OK)
        self.assertIn("summary", res_json.data)
        self.assertIn("rows", res_json.data)

        # CSV response
        res_csv = self.client.get("/api/reports/bookings/?format=csv")
        self.assertEqual(res_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_csv["Content-Type"], "text/csv")
        self.assertIn("attachment; filename=", res_csv["Content-Disposition"])
        self.assertIn("Customer Email", res_csv.content.decode("utf-8"))

        # Vehicle Utilization report
        res_util = self.client.get("/api/reports/vehicle-utilization/")
        self.assertEqual(res_util.status_code, status.HTTP_200_OK)
        self.assertIn("total_vehicles", res_util.data["summary"])

        res_util_csv = self.client.get("/api/reports/vehicle-utilization/?format=csv")
        self.assertEqual(res_util_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_util_csv["Content-Type"], "text/csv")

    def test_fleet_manager_gets_403_on_payments_report(self):
        # Admin can access payments report
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get("/api/reports/payments/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

        # Fleet Manager gets 403
        self.client.force_authenticate(user=self.fleet_manager)
        res_fm = self.client.get("/api/reports/payments/")
        self.assertEqual(res_fm.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # Test 8: seed_demo_data command idempotency & login
    # -------------------------------------------------------------------------
    def test_seed_demo_data_works_and_can_run_twice_without_errors(self):
        from django.test import override_settings

        # Refuses when DEBUG is False
        with override_settings(DEBUG=False):
            out_debug_false = StringIO()
            call_command("seed_demo_data", stdout=out_debug_false)
            self.assertIn("cannot be run when DEBUG is False", out_debug_false.getvalue())

        # Safe to run twice when DEBUG is True
        with override_settings(DEBUG=True):
            out1 = StringIO()
            call_command("seed_demo_data", stdout=out1)
            self.assertIn("Demo data seeding completed successfully!", out1.getvalue())
            self.assertIn("admin@fleetflow.com", out1.getvalue())

            out2 = StringIO()
            call_command("seed_demo_data", stdout=out2)
            self.assertIn("Demo data seeding completed successfully!", out2.getvalue())

        # Demo users can login with Demo@12345
        demo_logins = [
            ("admin@fleetflow.com", "Demo@12345"),
            ("manager@fleetflow.com", "Demo@12345"),
            ("driver1@fleetflow.com", "Demo@12345"),
            ("customer1@fleetflow.com", "Demo@12345"),
        ]
        for email, pwd in demo_logins:
            res_login = self.client.post("/api/auth/login/", {"email": email, "password": pwd})
            self.assertEqual(res_login.status_code, status.HTTP_200_OK, f"Failed login for {email}")

    # -------------------------------------------------------------------------
    # Tests for Fuel, Expense, Document Reports & Dashboards
    # -------------------------------------------------------------------------
    def test_new_reports_return_correct_numbers_and_csv_works(self):
        """Test the 4 new reports in both JSON and CSV formats."""
        self.client.force_authenticate(user=self.admin)

        # 1. Fuel Report
        FuelLog.objects.create(
            vehicle=self.vehicle_car,
            date=date.today(),
            fuel_type=FuelLog.FuelType.PETROL,
            quantity=Decimal("30.00"),
            price_per_unit=Decimal("100.00"),
            odometer_km=5000,
            is_full_tank=True,
            created_by=self.admin,
            review_status=FuelLog.ReviewStatus.APPROVED,
        )
        res_fuel = self.client.get("/api/reports/fuel/")
        self.assertEqual(res_fuel.status_code, status.HTTP_200_OK)
        self.assertIn("total_quantity", res_fuel.data["summary"])
        self.assertEqual(res_fuel.data["summary"]["total_quantity"], 30.0)

        res_fuel_csv = self.client.get("/api/reports/fuel/?format=csv")
        self.assertEqual(res_fuel_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_fuel_csv["Content-Type"], "text/csv")
        self.assertIn("Price Per Unit", res_fuel_csv.content.decode("utf-8"))

        # 2. Expenses Report
        Expense.objects.create(
            category=Expense.Category.TOLL,
            vehicle=self.vehicle_car,
            amount=Decimal("150.00"),
            date=date.today(),
            description="Toll charge",
            status=Expense.Status.APPROVED,
            submitted_by=self.admin,
        )
        res_exp = self.client.get("/api/reports/expenses/")
        self.assertEqual(res_exp.status_code, status.HTTP_200_OK)
        self.assertIn("approved_amount", res_exp.data["summary"])
        self.assertEqual(res_exp.data["summary"]["approved_amount"], 150.0)

        res_exp_csv = self.client.get("/api/reports/expenses/?format=csv")
        self.assertEqual(res_exp_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_exp_csv["Content-Type"], "text/csv")
        self.assertIn("Category", res_exp_csv.content.decode("utf-8"))

        # 3. Documents Expiry Report
        Document.objects.create(
            vehicle=self.vehicle_car,
            doc_type=Document.DocType.INSURANCE,
            document_number="INS-REP-01",
            expiry_date=date.today() + timedelta(days=5),
            uploaded_by=self.admin,
        )
        res_doc = self.client.get("/api/reports/documents-expiry/")
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)
        self.assertIn("expiring_soon_count", res_doc.data["summary"])

        res_doc_csv = self.client.get("/api/reports/documents-expiry/?format=csv")
        self.assertEqual(res_doc_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_doc_csv["Content-Type"], "text/csv")
        self.assertIn("Expiry Date", res_doc_csv.content.decode("utf-8"))

        # 4. Vehicle Cost Report
        res_vcost = self.client.get("/api/reports/vehicle-cost/")
        self.assertEqual(res_vcost.status_code, status.HTTP_200_OK)
        self.assertIn("total_fuel_cost", res_vcost.data["summary"])
        self.assertIn("total_expense_cost", res_vcost.data["summary"])

        res_vcost_csv = self.client.get("/api/reports/vehicle-cost/?format=csv")
        self.assertEqual(res_vcost_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_vcost_csv["Content-Type"], "text/csv")
        self.assertIn("Cost Per KM", res_vcost_csv.content.decode("utf-8"))

    def test_customer_and_driver_get_403_on_manager_reports(self):
        """Customer and Driver cannot access manager reports."""
        endpoints = [
            "/api/reports/fuel/",
            "/api/reports/expenses/",
            "/api/reports/documents-expiry/",
            "/api/reports/vehicle-cost/",
        ]
        # Test Customer
        self.client.force_authenticate(user=self.customer)
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Customer should get 403 on {ep}")

        # Test Driver
        self.client.force_authenticate(user=self.driver_user)
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Driver should get 403 on {ep}")

    def test_dashboards_return_new_features_metrics(self):
        """Admin, Fleet Manager, and Driver dashboards return the required new metrics."""
        # 1. Admin Dashboard
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get("/api/dashboard/admin/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertIn("expiring_documents_count", res_admin.data)
        self.assertIn("expired_documents_count", res_admin.data)
        self.assertIn("fuel_cost_this_month", res_admin.data)
        self.assertIn("expenses_this_month", res_admin.data)
        self.assertIn("top_cost_vehicles", res_admin.data)
        self.assertIn("next_5_expiring_documents", res_admin.data)

        # 2. Fleet Manager Dashboard
        self.client.force_authenticate(user=self.fleet_manager)
        res_fm = self.client.get("/api/dashboard/fleet-manager/")
        self.assertEqual(res_fm.status_code, status.HTTP_200_OK)
        self.assertIn("expiring_documents_count", res_fm.data)
        self.assertIn("expired_documents_count", res_fm.data)
        self.assertIn("fuel_cost_this_month", res_fm.data)
        self.assertIn("expenses_this_month", res_fm.data)
        self.assertIn("top_cost_vehicles", res_fm.data)
        self.assertIn("next_5_expiring_documents", res_fm.data)

        # 3. Driver Dashboard
        self.client.force_authenticate(user=self.driver_user)
        res_driver = self.client.get("/api/dashboard/driver/")
        self.assertEqual(res_driver.status_code, status.HTTP_200_OK)
        self.assertIn("own_fuel_logs_this_month", res_driver.data)
        self.assertIn("own_pending_expenses_count", res_driver.data)


