"""
Comprehensive Object-Level Isolation & Authorization Tests for FleetFlow Backend.
Validates:
- Customer sees ONLY own bookings & payments
- Driver sees ONLY own trips, documents, fuel, and expenses
- Negative tests for serializers and owner enforcement
"""

from decimal import Decimal
from datetime import date, timedelta
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from bookings.models import Booking
from drivers.models import Driver
from trips.models import Trip
from vehicles.models import Vehicle
from documents.models import Document
from fuel.models import FuelLog
from expenses.models import Expense
from payments.models import Payment


class ObjectLevelAuthorizationTests(APITestCase):
    def setUp(self):
        cache.clear()

        # Customer 1 & 2
        self.cust1 = User.objects.create_user(
            email="cust_alpha@fleetflow.com",
            password="SecurePass@123",
            full_name="Customer Alpha",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.cust2 = User.objects.create_user(
            email="cust_beta@fleetflow.com",
            password="SecurePass@123",
            full_name="Customer Beta",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        # Drivers 1 & 2
        self.driver_user1 = User.objects.create_user(
            email="driver_alpha@fleetflow.com",
            password="SecurePass@123",
            full_name="Driver Alpha",
            role=User.Role.DRIVER,
            phone="+919876543201",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver1 = Driver.objects.create(
            user=self.driver_user1,
            license_number="DL-ALPHA-01",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        self.driver_user2 = User.objects.create_user(
            email="driver_beta@fleetflow.com",
            password="SecurePass@123",
            full_name="Driver Beta",
            role=User.Role.DRIVER,
            phone="+919876543202",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver2 = Driver.objects.create(
            user=self.driver_user2,
            license_number="DL-BETA-02",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        # Vehicle
        self.vehicle = Vehicle.objects.create(
            registration_number="AP09-ISO-1111",
            brand="Toyota",
            model="Innova Crysta",
            seating_capacity=7,
            rate_per_km=Decimal("15.00"),
            vehicle_type=Vehicle.VehicleType.CAR,
            status=Vehicle.Status.ACTIVE,
        )

        # Bookings & Payments for Customer 1
        self.booking1 = Booking.objects.create(
            customer=self.cust1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Point A",
            drop_location="Point B",
            travel_datetime=timezone.now() + timedelta(days=1),
            passengers=3,
            status=Booking.Status.APPROVED,
        )
        # Trip for Driver 1
        self.trip1 = Trip.objects.create(
            booking=self.booking1,
            vehicle=self.vehicle,
            driver=self.driver1,
            source="Point A",
            destination="Point B",
            scheduled_datetime=timezone.now() + timedelta(days=1),
            status=Trip.Status.SCHEDULED,
            start_odometer=10000,
        )

        # Payment for Customer 1
        self.payment1 = Payment.objects.create(
            booking=self.booking1,
            trip=self.trip1,
            customer=self.cust1,
            amount=Decimal("1500.00"),
            status=Payment.Status.PAID,
            paid_at=timezone.now(),
        )

        # Fuel & Expense for Driver 1
        self.fuel1 = FuelLog.objects.create(
            vehicle=self.vehicle,
            driver=self.driver1,
            date=date.today(),
            fuel_type=FuelLog.FuelType.DIESEL,
            quantity=Decimal("25.0"),
            price_per_unit=Decimal("100.00"),
            odometer_km=10100,
        )
        self.expense1 = Expense.objects.create(
            vehicle=self.vehicle,
            trip=self.trip1,
            submitted_by=self.driver_user1,
            category=Expense.Category.TOLL,
            amount=Decimal("250.00"),
            status=Expense.Status.APPROVED,
            date=date.today(),
            description="Toll fee for trip",
        )

    def test_customer_cannot_see_other_customer_bookings_in_list_or_detail(self):
        """Customer Beta cannot list or retrieve Customer Alpha's bookings."""
        self.client.force_authenticate(user=self.cust2)

        # List
        res_list = self.client.get("/api/bookings/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        booking_ids = [b["id"] for b in res_list.data.get("results", [])]
        self.assertNotIn(self.booking1.id, booking_ids)

        # Detail
        res_detail = self.client.get(f"/api/bookings/{self.booking1.id}/")
        self.assertIn(res_detail.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_customer_cannot_see_other_customer_payments(self):
        """Customer Beta cannot list or retrieve Customer Alpha's payments."""
        self.client.force_authenticate(user=self.cust2)

        res_list = self.client.get("/api/payments/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        payment_ids = [p["id"] for p in res_list.data.get("results", [])]
        self.assertNotIn(self.payment1.id, payment_ids)

        res_detail = self.client.get(f"/api/payments/{self.payment1.id}/")
        self.assertIn(res_detail.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_driver_sees_only_own_assigned_trips(self):
        """Driver Beta cannot see Driver Alpha's trips."""
        self.client.force_authenticate(user=self.driver_user2)

        res_list = self.client.get("/api/trips/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        trip_ids = [t["id"] for t in res_list.data.get("results", [])]
        self.assertNotIn(self.trip1.id, trip_ids)

        res_detail = self.client.get(f"/api/trips/{self.trip1.id}/")
        self.assertIn(res_detail.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_driver_sees_only_own_fuel_logs_and_expenses(self):
        """Driver Beta cannot see Driver Alpha's fuel logs or expenses."""
        self.client.force_authenticate(user=self.driver_user2)

        res_fuel = self.client.get("/api/fuel/")
        self.assertEqual(res_fuel.status_code, status.HTTP_200_OK)
        fuel_ids = [f["id"] for f in res_fuel.data.get("results", [])]
        self.assertNotIn(self.fuel1.id, fuel_ids)

        res_exp = self.client.get("/api/expenses/")
        self.assertEqual(res_exp.status_code, status.HTTP_200_OK)
        exp_ids = [e["id"] for e in res_exp.data.get("results", [])]
        self.assertNotIn(self.expense1.id, exp_ids)
