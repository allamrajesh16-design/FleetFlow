from datetime import timedelta, date
from decimal import Decimal
import time
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from bookings.models import Booking
from documents.models import Document
from drivers.models import Driver
from notifications.models import Notification
from trips.models import Trip, TripAssignmentLog
from vehicles.models import Vehicle, Maintenance

User = get_user_model()


class DispatchCenterBackendTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "TestPass@123"

        # Admin
        self.admin = User.objects.create_user(
            email="dispatch.admin@fleetflow.com",
            password=self.password,
            role=User.Role.ADMIN,
            full_name="Dispatch Admin",
        )

        # Fleet Manager
        self.manager = User.objects.create_user(
            email="dispatch.manager@fleetflow.com",
            password=self.password,
            role=User.Role.FLEET_MANAGER,
            full_name="Dispatch Manager",
        )

        # Customer
        self.customer = User.objects.create_user(
            email="dispatch.customer@fleetflow.com",
            password=self.password,
            role=User.Role.CUSTOMER,
            full_name="Aarav Sharma",
            phone="+919876543210",
        )

        # Drivers
        self.u_driver1 = User.objects.create_user(
            email="dispatch.driver1@fleetflow.com",
            password=self.password,
            role=User.Role.DRIVER,
            full_name="Ramesh Kumar",
            phone="+919876543211",
        )
        self.driver1 = Driver.objects.create(
            user=self.u_driver1,
            license_number="DL-01-2020-001",
            license_expiry=timezone.localdate() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        self.u_driver2 = User.objects.create_user(
            email="dispatch.driver2@fleetflow.com",
            password=self.password,
            role=User.Role.DRIVER,
            full_name="Suresh Verma",
            phone="+919876543212",
        )
        self.driver2 = Driver.objects.create(
            user=self.u_driver2,
            license_number="DL-01-2020-002",
            license_expiry=timezone.localdate() + timedelta(days=400),
            status=Driver.Status.ACTIVE,
        )

        # Vehicles
        self.car_small = Vehicle.objects.create(
            registration_number="AP05AB1001",
            brand="Maruti",
            model="Swift",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=4,
            rate_per_km=Decimal("12.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.car_large = Vehicle.objects.create(
            registration_number="AP05CD2002",
            brand="Toyota",
            model="Innova",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=7,
            rate_per_km=Decimal("18.00"),
            status=Vehicle.Status.ACTIVE,
        )

        # Approved Documents for vehicles so compliance checks pass
        for v in [self.car_small, self.car_large]:
            Document.objects.create(
                vehicle=v,
                doc_type=Document.DocType.INSURANCE,
                document_number=f"INS-{v.registration_number}",
                expiry_date=timezone.localdate() + timedelta(days=180),
                review_status=Document.ReviewStatus.APPROVED,
            )
            Document.objects.create(
                vehicle=v,
                doc_type=Document.DocType.REGISTRATION_RC,
                document_number=f"RC-{v.registration_number}",
                expiry_date=timezone.localdate() + timedelta(days=360),
                review_status=Document.ReviewStatus.APPROVED,
            )

        # Booking for tomorrow
        self.tomorrow_noon = timezone.now().replace(hour=12, minute=0, second=0, microsecond=0) + timedelta(days=1)
        self.booking = Booking.objects.create(
            customer=self.customer,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Secunderabad Station",
            drop_location="Hitec City",
            travel_datetime=self.tomorrow_noon,
            passengers=2,
            estimated_fare=Decimal("350.00"),
            estimated_distance_km=Decimal("25.00"),
            status=Booking.Status.APPROVED,
        )

    def test_dispatch_summary_endpoint_kpis_and_timing(self):
        """dispatch-summary returns 6 KPI chips and answers under 300ms."""
        self.client.force_authenticate(user=self.manager)
        t0 = time.time()
        res = self.client.get("/api/trips/dispatch-summary/")
        elapsed_ms = (time.time() - t0) * 1000.0

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        for key in ["waiting", "ready_now", "past_dates", "scheduled_today", "free_drivers_now", "free_vehicles_now"]:
            self.assertIn(key, data)

        self.assertGreaterEqual(data["waiting"], 1)
        self.assertGreaterEqual(data["free_drivers_now"], 2)
        self.assertGreaterEqual(data["free_vehicles_now"], 2)
        self.assertLess(elapsed_ms, 300.0, f"dispatch-summary took {elapsed_ms:.1f}ms (must be <300ms)")

    def test_assignable_returns_recommendation_and_busy_intervals(self):
        """assignable endpoint returns recommended vehicle/driver and timeline busy intervals."""
        self.client.force_authenticate(user=self.manager)
        res = self.client.get(f"/api/trips/assignable/?booking={self.booking.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertIn("recommended", res.data)
        self.assertIn("busy_intervals", res.data)
        rec = res.data["recommended"]
        self.assertIsNotNone(rec["vehicle_id"])
        self.assertIsNotNone(rec["driver_id"])
        # Swift (seats 4) should be picked over Innova (seats 7) for 2 passengers due to capacity waste rule!
        self.assertEqual(rec["vehicle_id"], self.car_small.id)
        self.assertTrue(len(rec["reasons"]) > 0)
        self.assertIn("Seats 4 for 2 passengers", rec["vehicle_reasons"])

    def test_assign_with_dispatch_note_and_notifications(self):
        """Assign creates trip, saves dispatch_note, logs ASSIGNED, notifies driver with note, customer without note/phone."""
        self.client.force_authenticate(user=self.manager)
        payload = {
            "booking": self.booking.id,
            "vehicle": self.car_small.id,
            "driver": self.driver1.id,
            "dispatch_note": "Customer will carry heavy luggage. Assist at gate 2.",
        }
        res = self.client.post("/api/trips/assign/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        trip_id = res.data["id"]
        trip = Trip.objects.get(pk=trip_id)
        self.assertEqual(trip.dispatch_note, "Customer will carry heavy luggage. Assist at gate 2.")
        self.assertEqual(trip.status, Trip.Status.SCHEDULED)

        # Check TripAssignmentLog
        log = TripAssignmentLog.objects.filter(trip=trip).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.action, TripAssignmentLog.Action.ASSIGNED)
        self.assertEqual(log.new_vehicle, self.car_small)
        self.assertEqual(log.new_driver, self.driver1)
        self.assertEqual(log.performed_by, self.manager)

        # Driver notification contains dispatch note
        driver_notif = Notification.objects.filter(user=self.u_driver1, item_id=trip.id).first()
        self.assertIsNotNone(driver_notif)
        self.assertIn("Customer will carry heavy luggage", driver_notif.message)

        # Customer notification does NOT contain dispatch note and does NOT contain driver phone number
        cust_notif = Notification.objects.filter(user=self.customer, item_id=self.booking.id).first()
        self.assertIsNotNone(cust_notif)
        self.assertNotIn("Customer will carry heavy luggage", cust_notif.message)
        self.assertNotIn(self.u_driver1.phone, cust_notif.message)

    def test_reassign_scheduled_trip_and_notifications(self):
        """Reassign updates vehicle/driver, creates REASSIGNED log, notifies old driver, new driver, and customer."""
        # Create initial trip
        trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.car_small,
            driver=self.driver1,
            source=self.booking.pickup_location,
            destination=self.booking.drop_location,
            scheduled_datetime=self.tomorrow_noon,
            status=Trip.Status.SCHEDULED,
            dispatch_note="Gate 4 pickup",
            assigned_by=self.manager,
        )

        self.client.force_authenticate(user=self.manager)
        payload = {
            "vehicle_id": self.car_large.id,
            "driver_id": self.driver2.id,
            "reason": "Driver 1 requested shift trade.",
        }
        res = self.client.post(f"/api/trips/{trip.id}/reassign/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        trip.refresh_from_db()
        self.assertEqual(trip.vehicle, self.car_large)
        self.assertEqual(trip.driver, self.driver2)

        # Assignment log
        log = TripAssignmentLog.objects.filter(trip=trip, action=TripAssignmentLog.Action.REASSIGNED).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.old_vehicle, self.car_small)
        self.assertEqual(log.new_vehicle, self.car_large)
        self.assertEqual(log.old_driver, self.driver1)
        self.assertEqual(log.new_driver, self.driver2)
        self.assertIn("shift trade", log.reason)

        # Notification to old driver: Trip reassigned/removed
        old_drv_notif = Notification.objects.filter(user=self.u_driver1, title="Trip Reassigned").first()
        self.assertIsNotNone(old_drv_notif)
        self.assertIn("removed from your schedule", old_drv_notif.message)

        # Notification to new driver: New trip assigned
        new_drv_notif = Notification.objects.filter(user=self.u_driver2, title="New Trip Assigned").first()
        self.assertIsNotNone(new_drv_notif)
        self.assertIn("Gate 4 pickup", new_drv_notif.message)

    def test_cannot_reassign_in_progress_trip(self):
        """Only SCHEDULED trips can be reassigned."""
        trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.car_small,
            driver=self.driver1,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            assigned_by=self.manager,
        )
        self.client.force_authenticate(user=self.manager)
        res = self.client.post(f"/api/trips/{trip.id}/reassign/", {"driver_id": self.driver2.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only SCHEDULED trips can be reassigned", res.data["detail"])

    def test_cancel_scheduled_trip_creates_assignment_log(self):
        """Cancelling a scheduled trip logs CANCELLED in TripAssignmentLog."""
        trip = Trip.objects.create(
            booking=self.booking,
            vehicle=self.car_small,
            driver=self.driver1,
            source="A",
            destination="B",
            scheduled_datetime=self.tomorrow_noon,
            status=Trip.Status.SCHEDULED,
            assigned_by=self.manager,
        )
        self.client.force_authenticate(user=self.manager)
        res = self.client.post(f"/api/trips/{trip.id}/cancel/", {"reason": "Customer cancelled booking"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        trip.refresh_from_db()
        self.assertEqual(trip.status, Trip.Status.CANCELLED)

        log = TripAssignmentLog.objects.filter(trip=trip, action=TripAssignmentLog.Action.CANCELLED).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.performed_by, self.manager)
