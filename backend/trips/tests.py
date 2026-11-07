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
from .models import Trip, TripLocation


class Stage5TripTests(APITestCase):
    def setUp(self):
        # Users
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpassword123",
            full_name="Admin User",
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
            full_name="Customer One",
            role=User.Role.CUSTOMER,
        )
        self.driver_user1 = User.objects.create_user(
            email="driver1@example.com",
            password="driverpassword123",
            full_name="Driver One",
            role=User.Role.DRIVER,
        )
        self.driver_user2 = User.objects.create_user(
            email="driver2@example.com",
            password="driverpassword123",
            full_name="Driver Two",
            role=User.Role.DRIVER,
        )

        # Drivers
        self.driver1 = Driver.objects.create(
            user=self.driver_user1,
            license_number="DL12345678",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )
        self.driver2 = Driver.objects.create(
            user=self.driver_user2,
            license_number="DL87654321",
            license_expiry=date.today() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        # Vehicles
        self.car = Vehicle.objects.create(
            registration_number="KA01CAR111",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Hyundai",
            model="Creta",
            seating_capacity=5,
            rate_per_km=Decimal("12.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.bike = Vehicle.objects.create(
            registration_number="KA01BIKE22",
            vehicle_type=Vehicle.VehicleType.BIKE,
            brand="Honda",
            model="Activa",
            seating_capacity=1,
            rate_per_km=Decimal("6.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.bus = Vehicle.objects.create(
            registration_number="KA01BUS333",
            vehicle_type=Vehicle.VehicleType.BUS,
            brand="Volvo",
            model="B11R",
            seating_capacity=40,
            min_passengers=15,
            rate_per_km=Decimal("40.00"),
            status=Vehicle.Status.ACTIVE,
        )

        # Approved Booking
        self.booking_approved = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Indiranagar",
            drop_location="Electronic City",
            travel_datetime=timezone.now() + timedelta(days=2),
            passengers=2,
            estimated_distance_km=Decimal("25.00"),
            estimated_fare=Decimal("300.00"),
            status=Booking.Status.APPROVED,
        )

    # 1. Fleet Manager assigns a vehicle and driver to an approved car booking
    def test_manager_assigns_vehicle_and_driver_to_approved_booking(self):
        self.client.force_authenticate(user=self.fleet_manager)
        payload = {
            "booking": self.booking_approved.id,
            "vehicle": self.car.id,
            "driver": self.driver1.id,
        }
        res = self.client.post("/api/trips/assign/", payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        trip_id = res.data["id"]
        self.assertEqual(res.data["status"], "SCHEDULED")

        # Booking is linked and vehicle is set
        self.booking_approved.refresh_from_db()
        self.assertEqual(self.booking_approved.vehicle, self.car)

        # Driver and customer notified
        self.assertTrue(Notification.objects.filter(user=self.driver_user1, title__icontains="Assigned").exists())
        self.assertTrue(Notification.objects.filter(user=self.customer1, title__icontains="Assigned").exists())

    # 2. Assignment blocked: inactive vehicle, inactive driver, overlapping time, unapproved booking, wrong vehicle type
    def test_assignment_blocked_reasons(self):
        self.client.force_authenticate(user=self.fleet_manager)

        # Inactive vehicle
        self.car.status = Vehicle.Status.MAINTENANCE
        self.car.save()
        res_veh = self.client.post("/api/trips/assign/", {
            "booking": self.booking_approved.id,
            "vehicle": self.car.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(res_veh.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("vehicle", str(res_veh.data))
        self.car.status = Vehicle.Status.ACTIVE
        self.car.save()

        # Inactive driver
        self.driver1.status = Driver.Status.INACTIVE
        self.driver1.save()
        res_drv = self.client.post("/api/trips/assign/", {
            "booking": self.booking_approved.id,
            "vehicle": self.car.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(res_drv.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("driver", str(res_drv.data))
        self.driver1.status = Driver.Status.ACTIVE
        self.driver1.save()

        # Unapproved booking
        pending_booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="A",
            drop_location="B",
            travel_datetime=timezone.now() + timedelta(days=2),
            passengers=1,
            status=Booking.Status.PENDING,
        )
        res_unapp = self.client.post("/api/trips/assign/", {
            "booking": pending_booking.id,
            "vehicle": self.car.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(res_unapp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("APPROVED", str(res_unapp.data))

        # Wrong vehicle type (assign bike to car booking)
        res_wrong = self.client.post("/api/trips/assign/", {
            "booking": self.booking_approved.id,
            "vehicle": self.bike.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(res_wrong.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("does not match", str(res_wrong.data))

        # Overlapping time: first assign trip 1
        assign_ok = self.client.post("/api/trips/assign/", {
            "booking": self.booking_approved.id,
            "vehicle": self.car.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(assign_ok.status_code, status.HTTP_201_CREATED)

        # Another booking at same time
        booking2 = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="C",
            drop_location="D",
            travel_datetime=self.booking_approved.travel_datetime,
            passengers=1,
            status=Booking.Status.APPROVED,
        )
        res_overlap = self.client.post("/api/trips/assign/", {
            "booking": booking2.id,
            "vehicle": self.car.id,
            "driver": self.driver2.id,  # Same vehicle at same time
        })
        self.assertEqual(res_overlap.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("scheduled time", str(res_overlap.data))

        # Rejects past scheduled datetime
        res_past = self.client.post("/api/trips/assign/", {
            "booking": booking2.id,
            "vehicle": self.car.id,
            "driver": self.driver2.id,
            "scheduled_datetime": (timezone.now() - timedelta(hours=2)).isoformat(),
        })
        self.assertEqual(res_past.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("past", str(res_past.data).lower())

    # 3. Driver sees only own trips, another driver gets 403 on start
    def test_driver_isolation_and_unauthorized_start_blocked(self):
        trip = Trip.objects.create(
            booking=self.booking_approved,
            vehicle=self.car,
            driver=self.driver1,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now() + timedelta(hours=2),
            status=Trip.Status.SCHEDULED,
        )

        # Driver 2 tries to list Driver 1's trips -> sees empty list
        self.client.force_authenticate(user=self.driver_user2)
        res_list = self.client.get("/api/trips/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        ids = [t["id"] for t in res_list.data["results"]]
        self.assertNotIn(trip.id, ids)

        # Driver 2 tries to start Driver 1's trip -> 403 Forbidden
        start_res = self.client.post(f"/api/trips/{trip.id}/start/", {"start_odometer": 10000})
        self.assertEqual(start_res.status_code, status.HTTP_403_FORBIDDEN)

    # 4. Start trip with odometer: vehicle and driver become ON_TRIP
    def test_start_trip_updates_status_to_on_trip(self):
        trip = Trip.objects.create(
            booking=self.booking_approved,
            vehicle=self.car,
            driver=self.driver1,
            source="Indiranagar",
            destination="Electronic City",
            scheduled_datetime=timezone.now() + timedelta(hours=1),
            status=Trip.Status.SCHEDULED,
        )

        self.client.force_authenticate(user=self.driver_user1)
        res = self.client.post(f"/api/trips/{trip.id}/start/", {"start_odometer": 12500})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "IN_PROGRESS")
        self.assertEqual(res.data["start_odometer"], 12500)

        # Vehicle and driver status updated to ON_TRIP
        self.car.refresh_from_db()
        self.driver1.refresh_from_db()
        self.assertEqual(self.car.status, Vehicle.Status.ON_TRIP)
        self.assertEqual(self.driver1.status, Driver.Status.ON_TRIP)

        # Customer notified that trip started
        self.assertTrue(Notification.objects.filter(user=self.customer1, title__icontains="Started").exists())

    # 5. Location updates are saved and /live/ shows them
    def test_location_updates_saved_and_shown_in_live(self):
        trip = Trip.objects.create(
            booking=self.booking_approved,
            vehicle=self.car,
            driver=self.driver1,
            source="Origin",
            destination="Dest",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            start_odometer=5000,
            started_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.driver_user1)
        loc_res = self.client.post(f"/api/trips/{trip.id}/location/", {
            "latitude": "12.971598",
            "longitude": "77.594562",
        })
        self.assertEqual(loc_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(trip.locations.count(), 1)

        # Fleet manager checks /api/trips/live/
        self.client.force_authenticate(user=self.fleet_manager)
        live_res = self.client.get("/api/trips/live/")
        self.assertEqual(live_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(live_res.data), 1)
        self.assertIsNotNone(live_res.data[0]["last_known_location"])
        self.assertEqual(Decimal(str(live_res.data[0]["last_known_location"]["latitude"])), Decimal("12.971598"))

    # 6. Complete trip: wrong odometer rejected, correct odometer gives the right distance and fare
    def test_complete_trip_odometer_validation_and_fare_calculation(self):
        trip = Trip.objects.create(
            booking=self.booking_approved,
            vehicle=self.car,  # rate_per_km is 12.00
            driver=self.driver1,
            source="Indiranagar",
            destination="Electronic City",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            start_odometer=10000,
            started_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.driver_user1)

        # Invalid end odometer (less than or equal to start_odometer)
        res_invalid = self.client.post(f"/api/trips/{trip.id}/complete/", {"end_odometer": 9999})
        self.assertEqual(res_invalid.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid end odometer: 10025 -> distance = 25 km -> fare = 25 * 12 = 300.00
        res_complete = self.client.post(f"/api/trips/{trip.id}/complete/", {"end_odometer": 10025})
        self.assertEqual(res_complete.status_code, status.HTTP_200_OK)
        trip.refresh_from_db()
        self.assertEqual(trip.status, Trip.Status.COMPLETED)
        self.assertEqual(trip.distance_km, 25)
        self.assertEqual(trip.total_fare, Decimal("300.00"))

    # 7. After completion: vehicle and driver are ACTIVE again, booking is COMPLETED, customer notified
    def test_post_completion_state_and_notification(self):
        trip = Trip.objects.create(
            booking=self.booking_approved,
            vehicle=self.car,
            driver=self.driver1,
            source="Origin",
            destination="Dest",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            start_odometer=1000,
            started_at=timezone.now(),
        )
        self.car.status = Vehicle.Status.ON_TRIP
        self.car.save()
        self.driver1.status = Driver.Status.ON_TRIP
        self.driver1.save()

        self.client.force_authenticate(user=self.driver_user1)
        self.client.post(f"/api/trips/{trip.id}/complete/", {"end_odometer": 1050})

        # Vehicle & driver set to ACTIVE
        self.car.refresh_from_db()
        self.driver1.refresh_from_db()
        self.assertEqual(self.car.status, Vehicle.Status.ACTIVE)
        self.assertEqual(self.driver1.status, Driver.Status.ACTIVE)

        # Booking set to COMPLETED and final_fare saved
        self.booking_approved.refresh_from_db()
        self.assertEqual(self.booking_approved.status, Booking.Status.COMPLETED)
        self.assertEqual(self.booking_approved.final_fare, Decimal("600.00"))

        # Customer notified
        cust_notifs = Notification.objects.filter(user=self.customer1, title="Trip Completed")
        self.assertTrue(cust_notifs.exists())
        self.assertIn("Total fare is Rs. 600.00", cust_notifs.first().message)

    # 8. Bus trip assignment works only for a CONFIRMED schedule
    def test_bus_trip_assignment_requires_confirmed_schedule(self):
        self.client.force_authenticate(user=self.fleet_manager)

        # OPEN schedule -> should be blocked
        sched_open = BusSchedule.objects.create(
            vehicle=self.bus,
            source="Bangalore",
            destination="Chennai",
            departure_datetime=timezone.now() + timedelta(days=2),
            fare_per_seat=Decimal("500.00"),
            status=BusSchedule.Status.OPEN,
        )
        res_open = self.client.post("/api/trips/assign/", {
            "bus_schedule": sched_open.id,
            "vehicle": self.bus.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(res_open.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("CONFIRMED", str(res_open.data))

        # CONFIRMED schedule -> successfully assigned
        sched_open.status = BusSchedule.Status.CONFIRMED
        sched_open.save()
        res_confirmed = self.client.post("/api/trips/assign/", {
            "bus_schedule": sched_open.id,
            "vehicle": self.bus.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(res_confirmed.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_confirmed.data["bus_schedule"], sched_open.id)

    # 9. Cancel a scheduled trip frees the vehicle and driver
    def test_cancel_scheduled_trip_frees_vehicle_and_driver(self):
        trip = Trip.objects.create(
            booking=self.booking_approved,
            vehicle=self.car,
            driver=self.driver1,
            source="Source",
            destination="Dest",
            scheduled_datetime=timezone.now() + timedelta(days=1),
            status=Trip.Status.SCHEDULED,
        )

        self.client.force_authenticate(user=self.fleet_manager)
        cancel_res = self.client.post(f"/api/trips/{trip.id}/cancel/")
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        trip.refresh_from_db()
        self.assertEqual(trip.status, Trip.Status.CANCELLED)

        # Vehicle and driver remain or return to ACTIVE
        self.car.refresh_from_db()
        self.driver1.refresh_from_db()
        self.assertEqual(self.car.status, Vehicle.Status.ACTIVE)
        self.assertEqual(self.driver1.status, Driver.Status.ACTIVE)

        # Driver and customer notified
        self.assertTrue(Notification.objects.filter(user=self.driver_user1, title__icontains="Cancelled").exists())
        self.assertTrue(Notification.objects.filter(user=self.customer1, title__icontains="Cancelled").exists())

    # 10. History and summary endpoints return correct data
    def test_history_and_summary_endpoints(self):
        # Create completed and cancelled trips
        t_comp = Trip.objects.create(
            booking=self.booking_approved,
            vehicle=self.car,
            driver=self.driver1,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.COMPLETED,
            start_odometer=100,
            end_odometer=150,
            total_fare=Decimal("600.00"),
        )
        t_canc = Trip.objects.create(
            vehicle=self.bike,
            driver=self.driver1,
            source="C",
            destination="D",
            scheduled_datetime=timezone.now() + timedelta(days=1),
            status=Trip.Status.CANCELLED,
        )
        t_sched = Trip.objects.create(
            vehicle=self.car,
            driver=self.driver1,
            source="E",
            destination="F",
            scheduled_datetime=timezone.now() + timedelta(hours=3),
            status=Trip.Status.SCHEDULED,
        )

        # Fleet Manager checks overall summary
        self.client.force_authenticate(user=self.fleet_manager)
        sum_res = self.client.get("/api/trips/summary/")
        self.assertEqual(sum_res.status_code, status.HTTP_200_OK)
        self.assertEqual(sum_res.data["total_trips"], 3)
        self.assertEqual(sum_res.data["completed_trips"], 1)
        self.assertEqual(sum_res.data["cancelled_trips"], 1)
        self.assertEqual(sum_res.data["scheduled_trips"], 1)

        # Driver checks driver-summary
        self.client.force_authenticate(user=self.driver_user1)
        drv_sum = self.client.get("/api/trips/driver-summary/")
        self.assertEqual(drv_sum.status_code, status.HTTP_200_OK)
        self.assertEqual(drv_sum.data["completed_trips_count"], 1)
        self.assertEqual(drv_sum.data["upcoming_trips_count"], 1)

        # Driver checks history
        hist_res = self.client.get("/api/trips/history/")
        self.assertEqual(hist_res.status_code, status.HTTP_200_OK)
        hist_ids = [t["id"] for t in hist_res.data["results"]]
        self.assertIn(t_comp.id, hist_ids)
        self.assertIn(t_canc.id, hist_ids)
        self.assertNotIn(t_sched.id, hist_ids)

    def test_assign_trip_rejects_vehicle_with_smaller_capacity_than_passengers(self):
        """Bug A check: Trip assignment rejects vehicle if seating_capacity < booking.passengers."""
        self.client.force_authenticate(user=self.fleet_manager)
        small_car = Vehicle.objects.create(
            registration_number="AP05TC0001",
            brand="Maruti",
            model="Alto",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=3,
            rate_per_km=Decimal("12.00"),
            status=Vehicle.Status.ACTIVE,
        )
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Origin",
            drop_location="Dest",
            travel_datetime=timezone.now() + timedelta(days=1),
            passengers=4,
            status=Booking.Status.APPROVED,
        )
        payload = {
            "booking": booking.id,
            "vehicle": small_car.id,
            "driver": self.driver1.id,
        }
        res = self.client.post("/api/trips/assign/", payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("vehicle", res.data)
        self.assertIn("Vehicle capacity (3) cannot accommodate booking passengers (4)", str(res.data["vehicle"]))

    def test_assignable_rules_and_bulk_performance(self):
        """Validates assignable endpoint rules, no N+1 queries, and low response time."""
        import time
        from django.db import connection, reset_queries
        from documents.models import Document
        from vehicles.models import Maintenance

        self.client.force_authenticate(user=self.fleet_manager)
        travel_dt = timezone.now() + timedelta(days=2)
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Point A",
            drop_location="Point B",
            travel_datetime=travel_dt,
            passengers=4,
            estimated_distance_km=40,
            status=Booking.Status.APPROVED,
        )

        # Vehicle under maintenance
        maint_car = Vehicle.objects.create(
            registration_number="AP05MAINT1",
            brand="Tata",
            model="Harrier",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=5,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )
        Maintenance.objects.create(
            vehicle=maint_car,
            title="Engine Overhaul",
            scheduled_date=travel_dt.date(),
            status=Maintenance.Status.SCHEDULED,
        )

        # Driver with expired license
        expired_driver_user = User.objects.create_user(
            email="exp.driver@example.com",
            phone="9199990001",
            full_name="Expired Driver",
            role=User.Role.DRIVER,
        )
        expired_driver = Driver.objects.create(
            user=expired_driver_user,
            license_number="DL-EXPIRED-01",
            license_expiry=travel_dt.date() - timedelta(days=5),
            status=Driver.Status.ACTIVE,
        )

        reset_queries()
        t0 = time.time()
        res = self.client.get(f"/api/trips/assignable/?booking={booking.id}&include_unavailable=true")
        duration_ms = (time.time() - t0) * 1000

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertLess(len(connection.queries), 15, "Queries must be bulk fetched without N+1 loops")
        self.assertLess(duration_ms, 500, "Response time must be fast")

        vehicles = {v["id"]: v for v in res.data["vehicles"]}
        drivers = {d["id"]: d for d in res.data["drivers"]}

        # Check vehicle maintenance rule
        self.assertIn(maint_car.id, vehicles)
        self.assertFalse(vehicles[maint_car.id]["available"])
        self.assertIn("maintenance", vehicles[maint_car.id]["reason"].lower())

        # Check driver expired license rule
        self.assertIn(expired_driver.id, drivers)
        self.assertFalse(drivers[expired_driver.id]["available"])
        self.assertIn("licence expires", drivers[expired_driver.id]["reason"].lower())

    def test_assignable_past_date_booking(self):
        """Past-date bookings mark date_passed=True and can_assign=False."""
        self.client.force_authenticate(user=self.fleet_manager)
        past_booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Past A",
            drop_location="Past B",
            travel_datetime=timezone.now() - timedelta(hours=5),
            passengers=2,
            status=Booking.Status.APPROVED,
        )
        res = self.client.get(f"/api/trips/assignable/?booking={past_booking.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["target"]["date_passed"])
        self.assertFalse(res.data["target"]["can_assign"])

    def test_assign_trip_concurrency_race(self):
        """Two concurrent assignments for the same driver: first succeeds, second fails with 400."""
        self.client.force_authenticate(user=self.fleet_manager)
        bkg1 = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Race 1",
            drop_location="Dest 1",
            travel_datetime=timezone.now() + timedelta(days=3),
            passengers=2,
            status=Booking.Status.APPROVED,
        )
        bkg2 = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Race 2",
            drop_location="Dest 2",
            travel_datetime=timezone.now() + timedelta(days=3),
            passengers=2,
            status=Booking.Status.APPROVED,
        )

        veh1 = self.car
        veh2 = Vehicle.objects.create(
            registration_number="AP05RACE01",
            brand="Honda",
            model="City",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=5,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )

        # First manager assigns driver1 to veh1
        res1 = self.client.post("/api/trips/assign/", {
            "booking": bkg1.id,
            "vehicle": veh1.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Second manager attempts to assign the same driver1 to overlapping time
        res2 = self.client.post("/api/trips/assign/", {
            "booking": bkg2.id,
            "vehicle": veh2.id,
            "driver": self.driver1.id,
        })
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Driver is not available", res2.data["detail"])

    def test_assignable_permissions_and_errors(self):
        """Unauthorized roles get 403; non-existent booking gets 404; missing param gets 400."""
        # Customer gets 403
        self.client.force_authenticate(user=self.customer1)
        res_cust = self.client.get("/api/trips/assignable/?booking=9999")
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        # Manager with missing param gets 400
        self.client.force_authenticate(user=self.fleet_manager)
        res_missing = self.client.get("/api/trips/assignable/")
        self.assertEqual(res_missing.status_code, status.HTTP_400_BAD_REQUEST)

        # Manager with non-existent booking gets 404
        res_404 = self.client.get("/api/trips/assignable/?booking=999999")
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)
