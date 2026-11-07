from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from drivers.models import Driver
from expenses.models import Expense
from notifications.models import Notification
from trips.models import Trip
from vehicles.models import Vehicle


class ExpenseManagementTests(APITestCase):
    def setUp(self):
        # Users
        self.admin = User.objects.create_superuser(
            email="admin_exp@fleetflow.com",
            password="Demo@12345",
            full_name="Admin Exp",
            role=User.Role.ADMIN,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.manager = User.objects.create_user(
            email="manager_exp@fleetflow.com",
            password="Demo@12345",
            full_name="Manager Exp",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver_user = User.objects.create_user(
            email="driver_exp@fleetflow.com",
            password="Demo@12345",
            full_name="Driver Exp",
            role=User.Role.DRIVER,
            phone="+919876543291",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver_profile = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-EXP-001",
            license_expiry=date.today() + timedelta(days=365),
        )
        self.customer = User.objects.create_user(
            email="customer_exp@fleetflow.com",
            password="Demo@12345",
            full_name="Customer Exp",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        # Vehicle & Trip
        self.vehicle = Vehicle.objects.create(
            registration_number="AP 05 EX 2002",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Toyota",
            model="Innova",
            seating_capacity=7,
            rate_per_km=Decimal("20.00"),
        )
        self.trip = Trip.objects.create(
            vehicle=self.vehicle,
            driver=self.driver_profile,
            source="Vijayawada",
            destination="Guntur",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            assigned_by=self.manager,
        )

    def test_driver_expense_starts_pending(self):
        """Expenses submitted by drivers start with PENDING status."""
        self.client.force_authenticate(user=self.driver_user)
        payload = {
            "category": Expense.Category.TOLL,
            "vehicle": self.vehicle.id,
            "trip": self.trip.id,
            "amount": "250.00",
            "date": date.today().isoformat(),
            "description": "Highway toll tax",
        }
        res = self.client.post("/api/expenses/", payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], Expense.Status.PENDING)

    def test_manager_expenses_are_auto_approved(self):
        """Expenses created by Admin or Fleet Manager are auto-approved."""
        self.client.force_authenticate(user=self.manager)
        payload = {
            "category": Expense.Category.INSURANCE,
            "vehicle": self.vehicle.id,
            "amount": "12000.00",
            "date": date.today().isoformat(),
            "description": "Annual fleet insurance premium",
        }
        res = self.client.post("/api/expenses/", payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], Expense.Status.APPROVED)
        self.assertEqual(res.data["reviewed_by"], self.manager.id)

    def test_manager_approval_and_rejection_notify_driver(self):
        """Approve and reject endpoints update status, store reviewer, and notify the driver."""
        expense = Expense.objects.create(
            category=Expense.Category.PARKING,
            vehicle=self.vehicle,
            trip=self.trip,
            amount=Decimal("100.00"),
            date=date.today(),
            description="Station parking",
            status=Expense.Status.PENDING,
            submitted_by=self.driver_user,
        )

        # 1. Approval
        self.client.force_authenticate(user=self.manager)
        appr_res = self.client.post(f"/api/expenses/{expense.id}/approve/")
        self.assertEqual(appr_res.status_code, status.HTTP_200_OK)
        expense.refresh_from_db()
        self.assertEqual(expense.status, Expense.Status.APPROVED)
        self.assertEqual(expense.reviewed_by, self.manager)

        # Check in-app notification sent to driver
        notif = Notification.objects.filter(user=self.driver_user, title="Expense Approved").first()
        self.assertIsNotNone(notif)
        self.assertIn("100.00", notif.message)

        # 2. Rejection (create another pending expense)
        expense2 = Expense.objects.create(
            category=Expense.Category.FINE,
            vehicle=self.vehicle,
            trip=self.trip,
            amount=Decimal("500.00"),
            date=date.today(),
            description="Speed violation",
            status=Expense.Status.PENDING,
            submitted_by=self.driver_user,
        )
        rej_res = self.client.post(f"/api/expenses/{expense2.id}/reject/", {"reason": "Fine due to driver negligence"})
        self.assertEqual(rej_res.status_code, status.HTTP_200_OK)
        expense2.refresh_from_db()
        self.assertEqual(expense2.status, Expense.Status.REJECTED)
        self.assertEqual(expense2.rejection_reason, "Fine due to driver negligence")

        rej_notif = Notification.objects.filter(user=self.driver_user, title="Expense Rejected").first()
        self.assertIsNotNone(rej_notif)
        self.assertIn("Fine due to driver negligence", rej_notif.message)

    def test_fuel_is_rejected_as_category(self):
        """Fuel is disallowed as an expense category."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/expenses/", {
            "category": "FUEL",
            "vehicle": self.vehicle.id,
            "amount": "1000.00",
            "date": date.today().isoformat(),
            "description": "Diesel fill",
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category", res.data)

    def test_approved_expense_cannot_be_edited_by_driver(self):
        """A driver cannot edit an already APPROVED expense."""
        expense = Expense.objects.create(
            category=Expense.Category.TOLL,
            vehicle=self.vehicle,
            trip=self.trip,
            amount=Decimal("300.00"),
            date=date.today(),
            description="Toll fee",
            status=Expense.Status.APPROVED,
            submitted_by=self.driver_user,
            reviewed_by=self.manager,
        )
        self.client.force_authenticate(user=self.driver_user)
        res = self.client.patch(f"/api/expenses/{expense.id}/", {"amount": "400.00"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_gets_403_on_expenses(self):
        """Customers get 403 on expense endpoints."""
        self.client.force_authenticate(user=self.customer)
        res = self.client.get("/api/expenses/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_expense_summary_is_correct(self):
        """Summary computes total approved by category and by vehicle."""
        self.client.force_authenticate(user=self.admin)
        Expense.objects.create(
            category=Expense.Category.TOLL,
            vehicle=self.vehicle,
            amount=Decimal("200.00"),
            date=date.today(),
            description="Toll 1",
            status=Expense.Status.APPROVED,
            submitted_by=self.admin,
        )
        Expense.objects.create(
            category=Expense.Category.PARKING,
            vehicle=self.vehicle,
            amount=Decimal("100.00"),
            date=date.today(),
            description="Parking 1",
            status=Expense.Status.APPROVED,
            submitted_by=self.admin,
        )
        Expense.objects.create(
            category=Expense.Category.TOLL,
            vehicle=self.vehicle,
            amount=Decimal("500.00"),
            date=date.today(),
            description="Pending toll",
            status=Expense.Status.PENDING,  # Should not be included in approved summary
            submitted_by=self.driver_user,
        )

        res = self.client.get("/api/expenses/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res.data["total_approved_amount"])), Decimal("300.00"))
        self.assertEqual(len(res.data["by_category"]), 2)
        self.assertEqual(len(res.data["by_vehicle"]), 1)
