from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from drivers.models import Driver
from fuel.models import FuelLog
from trips.models import Trip
from vehicles.models import Vehicle


class FuelManagementTests(APITestCase):
    def setUp(self):
        # Users
        self.admin = User.objects.create_superuser(
            email="admin_fuel@fleetflow.com",
            password="Demo@12345",
            full_name="Admin Fuel",
            role=User.Role.ADMIN,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.manager = User.objects.create_user(
            email="manager_fuel@fleetflow.com",
            password="Demo@12345",
            full_name="Manager Fuel",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver_user = User.objects.create_user(
            email="driver_fuel@fleetflow.com",
            password="Demo@12345",
            full_name="Driver Fuel",
            role=User.Role.DRIVER,
            phone="+919876543299",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver_profile = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-FUEL-001",
            license_expiry=date.today() + timedelta(days=365),
        )
        self.other_driver_user = User.objects.create_user(
            email="other_driver_fuel@fleetflow.com",
            password="Demo@12345",
            full_name="Other Driver",
            role=User.Role.DRIVER,
            phone="+919876543298",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.other_driver_profile = Driver.objects.create(
            user=self.other_driver_user,
            license_number="DL-FUEL-002",
            license_expiry=date.today() + timedelta(days=365),
        )
        self.customer = User.objects.create_user(
            email="customer_fuel@fleetflow.com",
            password="Demo@12345",
            full_name="Customer Fuel",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        # Vehicle
        self.vehicle = Vehicle.objects.create(
            registration_number="AP 05 FL 1001",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Hyundai",
            model="Creta",
            seating_capacity=5,
            rate_per_km=Decimal("15.00"),
        )

        # Trip assigned to driver_profile
        self.trip = Trip.objects.create(
            vehicle=self.vehicle,
            driver=self.driver_profile,
            source="Rajahmundry",
            destination="Kakinada",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            assigned_by=self.manager,
        )

    def test_total_cost_calculated_by_server_never_trusted_from_client(self):
        """Verify client-submitted total_cost is ignored and calculated server-side."""
        self.client.force_authenticate(user=self.driver_user)
        payload = {
            "vehicle": self.vehicle.id,
            "date": date.today().isoformat(),
            "fuel_type": FuelLog.FuelType.DIESEL,
            "quantity": "50.00",
            "price_per_unit": "95.00",
            "total_cost": "1.00",  # Fake cost from client
            "odometer_km": 10000,
            "is_full_tank": True,
        }
        res = self.client.post("/api/fuel/", payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data["total_cost"])), Decimal("4750.00"))

    def test_odometer_cannot_go_backwards(self):
        """Verify odometer reading must be >= previous fuel log odometer."""
        self.client.force_authenticate(user=self.driver_user)
        # Log 1
        self.client.post("/api/fuel/", {
            "vehicle": self.vehicle.id,
            "date": date.today().isoformat(),
            "fuel_type": FuelLog.FuelType.DIESEL,
            "quantity": "40.00",
            "price_per_unit": "95.00",
            "odometer_km": 15000,
            "is_full_tank": True,
        })
        # Log 2 with lower odometer
        res = self.client.post("/api/fuel/", {
            "vehicle": self.vehicle.id,
            "date": date.today().isoformat(),
            "fuel_type": FuelLog.FuelType.DIESEL,
            "quantity": "30.00",
            "price_per_unit": "95.00",
            "odometer_km": 14500,  # lower than 15000
            "is_full_tank": True,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("odometer_km", res.data)

    def test_mileage_kmpl_is_correct_for_known_example(self):
        """
        Fill 1: 10,000 km, full tank.
        Fill 2: 10,500 km, full tank, 50 liters.
        Mileage should be (10,500 - 10,000) / 50 = 10.00 km/l.
        """
        self.client.force_authenticate(user=self.driver_user)
        res1 = self.client.post("/api/fuel/", {
            "vehicle": self.vehicle.id,
            "date": (date.today() - timedelta(days=3)).isoformat(),
            "fuel_type": FuelLog.FuelType.DIESEL,
            "quantity": "45.00",
            "price_per_unit": "95.00",
            "odometer_km": 10000,
            "is_full_tank": True,
        })
        self.assertIsNone(res1.data["mileage_kmpl"])

        res2 = self.client.post("/api/fuel/", {
            "vehicle": self.vehicle.id,
            "date": date.today().isoformat(),
            "fuel_type": FuelLog.FuelType.DIESEL,
            "quantity": "50.00",
            "price_per_unit": "95.00",
            "odometer_km": 10500,
            "is_full_tank": True,
        })
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.data["mileage_kmpl"], 10.0)

    def test_driver_can_add_log_only_for_own_trip(self):
        """Driver can log fuel for own trip, but rejected for other vehicle/driver."""
        # Authenticate driver with own active trip on self.vehicle
        self.client.force_authenticate(user=self.driver_user)
        res = self.client.post("/api/fuel/", {
            "vehicle": self.vehicle.id,
            "trip": self.trip.id,
            "date": date.today().isoformat(),
            "fuel_type": FuelLog.FuelType.DIESEL,
            "quantity": "25.00",
            "price_per_unit": "96.00",
            "odometer_km": 12000,
            "is_full_tank": False,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Authenticate other driver who has no trip on this vehicle
        self.client.force_authenticate(user=self.other_driver_user)
        res_fail = self.client.post("/api/fuel/", {
            "vehicle": self.vehicle.id,
            "date": date.today().isoformat(),
            "fuel_type": FuelLog.FuelType.DIESEL,
            "quantity": "25.00",
            "price_per_unit": "96.00",
            "odometer_km": 12100,
            "is_full_tank": False,
        })
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_gets_403(self):
        """Customer cannot access fuel endpoints."""
        self.client.force_authenticate(user=self.customer)
        res = self.client.get("/api/fuel/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res_post = self.client.post("/api/fuel/", {})
        self.assertEqual(res_post.status_code, status.HTTP_403_FORBIDDEN)

    def test_summary_numbers_are_correct(self):
        """Summary aggregates total quantity, cost, average price, mileage, and vehicle breakdown."""
        self.client.force_authenticate(user=self.admin)
        FuelLog.objects.create(
            vehicle=self.vehicle,
            date=date.today() - timedelta(days=2),
            fuel_type=FuelLog.FuelType.DIESEL,
            quantity=Decimal("40.00"),
            price_per_unit=Decimal("100.00"),
            odometer_km=10000,
            is_full_tank=True,
            created_by=self.driver_user,
            driver=self.driver_profile,
            review_status=FuelLog.ReviewStatus.APPROVED,
        )
        FuelLog.objects.create(
            vehicle=self.vehicle,
            date=date.today(),
            fuel_type=FuelLog.FuelType.DIESEL,
            quantity=Decimal("60.00"),
            price_per_unit=Decimal("100.00"),
            odometer_km=10600,
            is_full_tank=True,
            created_by=self.driver_user,
            driver=self.driver_profile,
            review_status=FuelLog.ReviewStatus.APPROVED,
        )

        res = self.client.get("/api/fuel/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res.data["total_quantity"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(res.data["total_cost"])), Decimal("10000.00"))
        self.assertEqual(Decimal(str(res.data["average_price"])), Decimal("100.00"))
        self.assertEqual(res.data["average_mileage"], 10.0)  # (10600-10000)/60 = 10.0 km/l
        self.assertEqual(len(res.data["per_vehicle"]), 1)
