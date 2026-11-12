from datetime import timedelta
from decimal import Decimal
from django.db import models
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from drivers.models import Driver
from notifications.models import Notification
from documents.models import Document
from trips.models import Trip, TripLocation
from vehicles.models import Vehicle
from .models import BusSchedule, Booking
from .services import check_bus_schedules


class Stage4BookingBusRulesTests(APITestCase):
    def setUp(self):
        # Create users
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpassword123",
            full_name="Admin User",
        )
        self.fleet_manager = User.objects.create_user(
            email="manager@example.com",
            password="managerpassword123",
            full_name="Manager User",
            role=User.Role.FLEET_MANAGER,
        )
        self.customer1 = User.objects.create_user(
            email="cust1@example.com",
            password="custpassword123",
            full_name="Customer One",
            role=User.Role.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email="cust2@example.com",
            password="custpassword123",
            full_name="Customer Two",
            role=User.Role.CUSTOMER,
        )
        self.driver = User.objects.create_user(
            email="driver@example.com",
            password="driverpassword123",
            full_name="Driver User",
            role=User.Role.DRIVER,
        )

        # Create vehicles
        self.car = Vehicle.objects.create(
            registration_number="KA01CAR100",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Toyota",
            model="Innova",
            seating_capacity=6,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )
        self.bus = Vehicle.objects.create(
            registration_number="KA01BUS200",
            vehicle_type=Vehicle.VehicleType.BUS,
            brand="Volvo",
            model="9400",
            seating_capacity=30,
            min_passengers=10,
            rate_per_km=Decimal("35.00"),
            status=Vehicle.Status.ACTIVE,
        )

    # 1. Customer creates a car booking, Fleet Manager approves it, customer gets a notification
    def test_customer_creates_car_booking_manager_approves_and_notifies(self):
        self.client.force_authenticate(user=self.customer1)
        travel_time = timezone.now() + timedelta(days=2)
        payload = {
            "booking_type": "VEHICLE",
            "vehicle_type": "CAR",
            "vehicle": self.car.id,
            "pickup_location": "Central Station",
            "drop_location": "Airport",
            "travel_datetime": travel_time.isoformat(),
            "passengers": 3,
            "estimated_distance_km": "20.00",
        }
        res = self.client.post("/api/bookings/", payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        booking_id = res.data["id"]
        self.assertEqual(res.data["status"], "PENDING")
        self.assertEqual(Decimal(str(res.data["estimated_fare"])), Decimal("300.00"))

        # Fleet Manager approves the booking
        self.client.force_authenticate(user=self.fleet_manager)
        approve_res = self.client.post(f"/api/bookings/{booking_id}/approve/")
        self.assertEqual(approve_res.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_res.data["status"], "APPROVED")

        # Customer received notification
        customer_notifications = Notification.objects.filter(
            user=self.customer1,
            title__icontains="Approved",
        )
        self.assertTrue(customer_notifications.exists())

    # 2. Fleet Manager rejects with a reason
    def test_fleet_manager_rejects_booking_with_reason(self):
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            vehicle=self.car,
            pickup_location="Point A",
            drop_location="Point B",
            travel_datetime=timezone.now() + timedelta(days=3),
            passengers=2,
            status=Booking.Status.PENDING,
        )
        self.client.force_authenticate(user=self.fleet_manager)
        reject_res = self.client.post(
            f"/api/bookings/{booking.id}/reject/",
            {"rejection_reason": "No vehicles available at requested time slot."},
        )
        self.assertEqual(reject_res.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "REJECTED")
        self.assertEqual(booking.rejection_reason, "No vehicles available at requested time slot.")

        # Customer notified of rejection
        cust_notif = Notification.objects.filter(
            user=self.customer1,
            title__icontains="Rejected",
        )
        self.assertTrue(cust_notif.exists())
        self.assertIn("No vehicles available", cust_notif.first().message)

    # 3. Customer sees only own bookings, Admin sees all
    def test_customer_sees_only_own_bookings_admin_sees_all(self):
        # Create booking for cust1 and cust2
        b1 = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Point 1",
            drop_location="Point 2",
            travel_datetime=timezone.now() + timedelta(days=1),
            passengers=1,
            status=Booking.Status.PENDING,
        )
        b2 = Booking.objects.create(
            customer=self.customer2,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Point 3",
            drop_location="Point 4",
            travel_datetime=timezone.now() + timedelta(days=1),
            passengers=1,
            status=Booking.Status.PENDING,
        )

        # Customer 1 sees only own booking
        self.client.force_authenticate(user=self.customer1)
        res_cust1 = self.client.get("/api/bookings/")
        self.assertEqual(res_cust1.status_code, status.HTTP_200_OK)
        ids = [b["id"] for b in res_cust1.data["results"]]
        self.assertIn(b1.id, ids)
        self.assertNotIn(b2.id, ids)

        # Admin sees all bookings
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get("/api/bookings/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        admin_ids = [b["id"] for b in res_admin.data["results"]]
        self.assertIn(b1.id, admin_ids)
        self.assertIn(b2.id, admin_ids)

    # 4. Bus schedule creation, then seat booking reduces available seats
    def test_bus_schedule_creation_and_seat_booking_reduces_available_seats(self):
        # Fleet manager creates bus schedule
        self.client.force_authenticate(user=self.fleet_manager)
        dep_time = timezone.now() + timedelta(days=5)
        sched_payload = {
            "vehicle": self.bus.id,
            "source": "Bangalore",
            "destination": "Mysore",
            "departure_datetime": dep_time.isoformat(),
            "fare_per_seat": "350.00",
        }
        sched_res = self.client.post("/api/bus-schedules/", sched_payload)
        self.assertEqual(sched_res.status_code, status.HTTP_201_CREATED)
        sched_id = sched_res.data["id"]
        self.assertEqual(sched_res.data["available_seats"], 30)
        self.assertEqual(sched_res.data["booked_seats"], 0)

        # Customer 1 books 4 seats
        self.client.force_authenticate(user=self.customer1)
        book_res = self.client.post(
            "/api/bookings/",
            {
                "booking_type": "BUS_SEAT",
                "bus_schedule": sched_id,
                "passengers": 4,
            },
        )
        self.assertEqual(book_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(book_res.data["status"], "APPROVED")
        self.assertEqual(Decimal(str(book_res.data["estimated_fare"])), Decimal("1400.00"))

        # Verify schedule now has 26 seats available
        self.client.force_authenticate(user=self.customer1)
        sched_view = self.client.get(f"/api/bus-schedules/{sched_id}/")
        self.assertEqual(sched_view.data["available_seats"], 26)
        self.assertEqual(sched_view.data["booked_seats"], 4)

    # 5. Booking is blocked when seats are full and when inside the 10-hour deadline
    def test_booking_blocked_when_full_and_inside_10_hour_deadline(self):
        # Test full seats
        schedule_full = BusSchedule.objects.create(
            vehicle=self.bus,
            source="City A",
            destination="City B",
            departure_datetime=timezone.now() + timedelta(days=2),
            fare_per_seat=Decimal("200.00"),
            status=BusSchedule.Status.OPEN,
        )
        # Pre-book all 30 seats
        Booking.objects.create(
            customer=self.customer2,
            booking_type=Booking.BookingType.BUS_SEAT,
            vehicle_type=Booking.VehicleType.BUS,
            vehicle=self.bus,
            bus_schedule=schedule_full,
            pickup_location="City A",
            drop_location="City B",
            travel_datetime=schedule_full.departure_datetime,
            passengers=30,
            status=Booking.Status.APPROVED,
        )
        self.assertEqual(schedule_full.available_seats, 0)

        self.client.force_authenticate(user=self.customer1)
        res_full = self.client.post(
            "/api/bookings/",
            {
                "booking_type": "BUS_SEAT",
                "bus_schedule": schedule_full.id,
                "passengers": 1,
            },
        )
        self.assertEqual(res_full.status_code, status.HTTP_400_BAD_REQUEST)

        # Test inside 10-hour deadline (departure 5 hours from now)
        schedule_soon = BusSchedule.objects.create(
            vehicle=self.bus,
            source="City X",
            destination="City Y",
            departure_datetime=timezone.now() + timedelta(hours=5),
            fare_per_seat=Decimal("200.00"),
            status=BusSchedule.Status.OPEN,
        )
        res_deadline = self.client.post(
            "/api/bookings/",
            {
                "booking_type": "BUS_SEAT",
                "bus_schedule": schedule_soon.id,
                "passengers": 1,
            },
        )
        self.assertEqual(res_deadline.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Booking closed", str(res_deadline.data))

    # 6. Bus rule A: minimum reached -> schedule CONFIRMED
    def test_bus_rule_a_minimum_reached_schedule_confirmed(self):
        schedule = BusSchedule.objects.create(
            vehicle=self.bus,  # min_passengers is 10
            source="Chennai",
            destination="Bangalore",
            departure_datetime=timezone.now() + timedelta(hours=9),  # within 10 hours
            fare_per_seat=Decimal("500.00"),
            status=BusSchedule.Status.OPEN,
        )
        # Create bookings totaling 12 passengers (>= 10)
        Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.BUS_SEAT,
            vehicle_type=Booking.VehicleType.BUS,
            bus_schedule=schedule,
            pickup_location="Chennai",
            drop_location="Bangalore",
            travel_datetime=schedule.departure_datetime,
            passengers=7,
            status=Booking.Status.APPROVED,
        )
        Booking.objects.create(
            customer=self.customer2,
            booking_type=Booking.BookingType.BUS_SEAT,
            vehicle_type=Booking.VehicleType.BUS,
            bus_schedule=schedule,
            pickup_location="Chennai",
            drop_location="Bangalore",
            travel_datetime=schedule.departure_datetime,
            passengers=5,
            status=Booking.Status.APPROVED,
        )

        # Run check
        result = check_bus_schedules()
        self.assertEqual(result["confirmed"], 1)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, BusSchedule.Status.CONFIRMED)

        # Customers got confirmed notification
        c1_notif = Notification.objects.filter(
            user=self.customer1,
            title="Bus Trip Confirmed",
        )
        self.assertTrue(c1_notif.exists())
        self.assertIn("is confirmed", c1_notif.first().message)

    # 7. Bus rule B: minimum not reached -> schedule CANCELLED, bookings CANCELLED with REFUND_PENDING, customers notified
    def test_bus_rule_b_minimum_not_reached_cancelled_and_refund_pending(self):
        schedule = BusSchedule.objects.create(
            vehicle=self.bus,  # min_passengers is 10
            source="Goa",
            destination="Mumbai",
            departure_datetime=timezone.now() + timedelta(hours=8),  # within 10 hours
            fare_per_seat=Decimal("600.00"),
            status=BusSchedule.Status.OPEN,
        )
        # Create booking for 3 passengers (< 10)
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.BUS_SEAT,
            vehicle_type=Booking.VehicleType.BUS,
            bus_schedule=schedule,
            pickup_location="Goa",
            drop_location="Mumbai",
            travel_datetime=schedule.departure_datetime,
            passengers=3,
            status=Booking.Status.APPROVED,
        )

        result = check_bus_schedules()
        self.assertEqual(result["cancelled"], 1)

        schedule.refresh_from_db()
        booking.refresh_from_db()
        self.assertEqual(schedule.status, BusSchedule.Status.CANCELLED)
        self.assertEqual(booking.status, Booking.Status.CANCELLED)
        self.assertEqual(booking.refund_status, Booking.RefundStatus.REFUND_PENDING)

        # Customer notified with 3 options
        c1_notif = Notification.objects.filter(
            user=self.customer1,
            title="Bus Schedule Cancelled",
        )
        self.assertTrue(c1_notif.exists())
        self.assertIn("take an alternative vehicle, cancel, or get a refund", c1_notif.first().message)

    # 8. Running check_bus_schedules twice does not send duplicate notifications
    def test_running_check_bus_schedules_twice_is_idempotent(self):
        schedule = BusSchedule.objects.create(
            vehicle=self.bus,
            source="Hyderabad",
            destination="Vijayawada",
            departure_datetime=timezone.now() + timedelta(hours=7),
            fare_per_seat=Decimal("400.00"),
            status=BusSchedule.Status.OPEN,
        )
        Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.BUS_SEAT,
            vehicle_type=Booking.VehicleType.BUS,
            bus_schedule=schedule,
            pickup_location="Hyderabad",
            drop_location="Vijayawada",
            travel_datetime=schedule.departure_datetime,
            passengers=12,
            status=Booking.Status.APPROVED,
        )

        # Run first time
        check_bus_schedules()
        notif_count_first = Notification.objects.count()

        # Run second time
        result_second = check_bus_schedules()
        self.assertEqual(result_second["processed"], 0)
        notif_count_second = Notification.objects.count()

        # No duplicate notifications created
        self.assertEqual(notif_count_first, notif_count_second)

    # 9. Customer chooses an option with /bus-response/
    def test_customer_chooses_bus_response_option(self):
        cancelled_schedule = BusSchedule.objects.create(
            vehicle=self.bus,
            source="Pune",
            destination="Nagpur",
            departure_datetime=timezone.now() + timedelta(hours=6),
            fare_per_seat=Decimal("500.00"),
            status=BusSchedule.Status.CANCELLED,
        )
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.BUS_SEAT,
            vehicle_type=Booking.VehicleType.BUS,
            bus_schedule=cancelled_schedule,
            pickup_location="Pune",
            drop_location="Nagpur",
            travel_datetime=cancelled_schedule.departure_datetime,
            passengers=2,
            status=Booking.Status.CANCELLED,
            refund_status=Booking.RefundStatus.REFUND_PENDING,
        )

        self.client.force_authenticate(user=self.customer1)
        res = self.client.post(
            f"/api/bookings/{booking.id}/bus-response/",
            {"choice": "ALTERNATIVE_VEHICLE"},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.bus_option_choice, "ALTERNATIVE_VEHICLE")

    # 10. Customer cannot cancel or see another customer's booking
    def test_customer_cannot_cancel_or_see_another_customers_booking(self):
        booking2 = Booking.objects.create(
            customer=self.customer2,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Location X",
            drop_location="Location Y",
            travel_datetime=timezone.now() + timedelta(days=2),
            passengers=2,
            status=Booking.Status.PENDING,
        )

        # Customer 1 attempts to see Customer 2's booking
        self.client.force_authenticate(user=self.customer1)
        get_res = self.client.get(f"/api/bookings/{booking2.id}/")
        self.assertEqual(get_res.status_code, status.HTTP_404_NOT_FOUND)

        # Customer 1 attempts to cancel Customer 2's booking
        cancel_res = self.client.post(f"/api/bookings/{booking2.id}/cancel/")
        self.assertEqual(cancel_res.status_code, status.HTTP_404_NOT_FOUND)

    # 11. Driver permission check
    def test_driver_cannot_access_bookings_or_schedules(self):
        self.client.force_authenticate(user=self.driver)
        b_res = self.client.get("/api/bookings/")
        self.assertEqual(b_res.status_code, status.HTTP_403_FORBIDDEN)

        s_res = self.client.get("/api/bus-schedules/")
        self.assertEqual(s_res.status_code, status.HTTP_403_FORBIDDEN)

    # 12. Notification endpoints check
    def test_notifications_endpoints(self):
        n1 = Notification.objects.create(
            user=self.customer1,
            title="Alert 1",
            message="Message 1",
            type=Notification.NotificationType.BOOKING,
        )
        n2 = Notification.objects.create(
            user=self.customer1,
            title="Alert 2",
            message="Message 2",
            type=Notification.NotificationType.SYSTEM,
        )

        self.client.force_authenticate(user=self.customer1)
        list_res = self.client.get("/api/notifications/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data["results"]), 2)

        # Mark single as read
        read_res = self.client.post(f"/api/notifications/{n1.id}/read/")
        self.assertEqual(read_res.status_code, status.HTTP_200_OK)
        n1.refresh_from_db()
        self.assertTrue(n1.is_read)

        # Mark all as read
        read_all_res = self.client.post("/api/notifications/read-all/")
        self.assertEqual(read_all_res.status_code, status.HTTP_200_OK)
        n2.refresh_from_db()
        self.assertTrue(n2.is_read)

    # 13. Tracking endpoint tests
    def test_tracking_owner_sees_data_and_steps(self):
        # Create booking for customer1
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Kakinada",
            drop_location="Rajahmundry",
            travel_datetime=timezone.now() + timedelta(days=1),
            status=Booking.Status.PENDING,
        )

        # 1. As owner, check initial state: step BOOKED, no trip, no location
        self.client.force_authenticate(user=self.customer1)
        res = self.client.get(f"/api/bookings/{booking.id}/tracking/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["step"], "BOOKED")
        self.assertEqual(res.data["booking_status"], Booking.Status.PENDING)
        self.assertIsNone(res.data["trip_status"])
        self.assertIsNone(res.data["last_known_location"])

        # 2. Driver profile and Trip assigned (SCHEDULED)
        driver_profile, _ = Driver.objects.get_or_create(
            user=self.driver,
            defaults={"license_number": "KA0120200001", "license_expiry": timezone.now().date() + timedelta(days=365)}
        )
        trip = Trip.objects.create(
            booking=booking,
            vehicle=self.car,
            driver=driver_profile,
            source="Kakinada",
            destination="Rajahmundry",
            scheduled_datetime=timezone.now() + timedelta(days=1),
            status=Trip.Status.SCHEDULED,
        )

        res = self.client.get(f"/api/bookings/{booking.id}/tracking/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["step"], "ASSIGNED")
        self.assertEqual(res.data["trip_status"], "SCHEDULED")
        self.assertEqual(res.data["driver_name"], self.driver.full_name)
        self.assertEqual(res.data["vehicle_registration"], self.car.registration_number)
        # Location is hidden when trip is not IN_PROGRESS
        self.assertIsNone(res.data["last_known_location"])

        # 3. Trip starts (IN_PROGRESS) with a location update
        trip.status = Trip.Status.IN_PROGRESS
        trip.started_at = timezone.now()
        trip.start_odometer = 10000
        trip.save()

        TripLocation.objects.create(
            trip=trip,
            latitude=Decimal("16.989060"),
            longitude=Decimal("82.247460"),
        )

        res = self.client.get(f"/api/bookings/{booking.id}/tracking/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["step"], "IN_PROGRESS")
        self.assertEqual(res.data["trip_status"], "IN_PROGRESS")
        self.assertIsNotNone(res.data["last_known_location"])
        self.assertAlmostEqual(float(res.data["last_known_location"]["latitude"]), 16.989060, places=4)
        self.assertAlmostEqual(float(res.data["last_known_location"]["longitude"]), 82.247460, places=4)

        # 4. Trip completes (COMPLETED)
        trip.status = Trip.Status.COMPLETED
        trip.end_odometer = 10065
        trip.completed_at = timezone.now()
        trip.save()

        res = self.client.get(f"/api/bookings/{booking.id}/tracking/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["step"], "COMPLETED")
        self.assertEqual(res.data["trip_status"], "COMPLETED")
        # Location is hidden when trip is COMPLETED
        self.assertIsNone(res.data["last_known_location"])

    def test_tracking_permissions_another_customer_or_driver(self):
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Kakinada",
            drop_location="Rajahmundry",
            travel_datetime=timezone.now() + timedelta(days=1),
            status=Booking.Status.PENDING,
        )

        # Another customer trying to access -> 404 Not Found (or 403)
        self.client.force_authenticate(user=self.customer2)
        res = self.client.get(f"/api/bookings/{booking.id}/tracking/")
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

        # Driver trying to access -> 403 Forbidden
        self.client.force_authenticate(user=self.driver)
        res = self.client.get(f"/api/bookings/{booking.id}/tracking/")
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_bug_a_passenger_limits_without_vehicle_selected(self):
        """Bug A: Passenger limit enforced by vehicle_type even when no vehicle chosen."""
        self.client.force_authenticate(user=self.customer1)

        # Bike with 2 passengers must be rejected
        payload_bike = {
            "booking_type": "VEHICLE",
            "vehicle_type": "BIKE",
            "pickup_location": "Main Road",
            "drop_location": "Market",
            "travel_datetime": (timezone.now() + timedelta(days=1)).isoformat(),
            "passengers": 2,
        }
        res_bike = self.client.post("/api/bookings/", payload_bike)
        self.assertEqual(res_bike.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("passengers", res_bike.data)

        # Car with passengers exceeding all active cars capacity
        max_active_cap = Vehicle.objects.filter(
            vehicle_type=Vehicle.VehicleType.CAR,
            status=Vehicle.Status.ACTIVE
        ).aggregate(models.Max("seating_capacity"))["seating_capacity__max"] or 4

        payload_car_excess = {
            "booking_type": "VEHICLE",
            "vehicle_type": "CAR",
            "pickup_location": "Main Road",
            "drop_location": "Market",
            "travel_datetime": (timezone.now() + timedelta(days=1)).isoformat(),
            "passengers": max_active_cap + 1,
        }
        res_car = self.client.post("/api/bookings/", payload_car_excess)
        self.assertEqual(res_car.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("passengers", res_car.data)

    def test_bug_b_estimated_fare_and_basis_without_vehicle(self):
        """Bug B: Without vehicle, estimated_fare uses lowest active rate, returns basis; null when no distance."""
        self.client.force_authenticate(user=self.customer1)

        # 1. Booking without distance -> estimated_fare is None, estimated_fare_basis is None
        payload_no_dist = {
            "booking_type": "VEHICLE",
            "vehicle_type": "CAR",
            "pickup_location": "Main Road",
            "drop_location": "Market",
            "travel_datetime": (timezone.now() + timedelta(days=1)).isoformat(),
            "passengers": 2,
        }
        res1 = self.client.post("/api/bookings/", payload_no_dist)
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res1.data["estimated_fare"])
        self.assertIsNone(res1.data["estimated_fare_basis"])

        # 2. Booking with distance and no vehicle -> uses lowest rate
        lowest_rate = Vehicle.objects.filter(
            vehicle_type=Vehicle.VehicleType.CAR,
            status=Vehicle.Status.ACTIVE
        ).aggregate(models.Min("rate_per_km"))["rate_per_km__min"]

        payload_dist = {
            "booking_type": "VEHICLE",
            "vehicle_type": "CAR",
            "pickup_location": "Main Road",
            "drop_location": "Market",
            "travel_datetime": (timezone.now() + timedelta(days=1)).isoformat(),
            "passengers": 2,
            "estimated_distance_km": 50,
        }
        res2 = self.client.post("/api/bookings/", payload_dist)
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        expected_fare = Decimal("50") * lowest_rate
        self.assertEqual(Decimal(str(res2.data["estimated_fare"])), expected_fare)
        self.assertEqual(res2.data["estimated_fare_basis"], "lowest_rate")

    def test_approve_booking_with_null_estimated_fare(self):
        """Admin or Fleet Manager approves a vehicle booking where estimated_fare is null."""
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            pickup_location="Main Road",
            drop_location="Market",
            travel_datetime=timezone.now() + timedelta(days=1),
            passengers=2,
            estimated_distance_km=None,
            estimated_fare=None,
            status=Booking.Status.PENDING,
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f"/api/bookings/{booking.id}/approve/", {"vehicle_id": self.car.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.APPROVED)
        self.assertEqual(booking.vehicle, self.car)
        self.assertIsNone(booking.estimated_fare)

    def test_bike_passenger_limit_and_round_trip(self):
        """Bike passenger limit (max 2) and round trip return datetime validation."""
        self.client.force_authenticate(user=self.customer1)

        # 3 passengers on bike must be rejected (max 2 rule)
        now = timezone.now()
        payload = {
            "booking_type": "VEHICLE",
            "vehicle_type": "BIKE",
            "pickup_location": "RTC Complex",
            "drop_location": "Beach Road",
            "travel_datetime": (now + timedelta(days=1)).isoformat(),
            "passengers": 3,
        }
        res = self.client.post("/api/bookings/", payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("passengers", res.data)

        # Create a 2-seater bike in fleet
        Vehicle.objects.create(
            registration_number="KA01BIKE200",
            vehicle_type=Vehicle.VehicleType.BIKE,
            brand="Royal Enfield",
            model="Classic 350",
            seating_capacity=2,
            rate_per_km=Decimal("10.00"),
            status=Vehicle.Status.ACTIVE,
        )

        # 2 passengers on bike is allowed when 2-seater bike is in fleet
        payload["passengers"] = 2
        payload["trip_type"] = "ROUND_TRIP"
        # Round trip without return_datetime must fail
        res2 = self.client.post("/api/bookings/", payload)
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("return_datetime", res2.data)

        # Round trip with return_datetime after travel_datetime succeeds
        payload["return_datetime"] = (now + timedelta(days=1, hours=4)).isoformat()
        res3 = self.client.post("/api/bookings/", payload)
        self.assertEqual(res3.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res3.data["passengers"], 2)
        self.assertEqual(res3.data["trip_type"], "ROUND_TRIP")

    def test_structured_pickup_and_drop_details(self):
        """Structured pickup and drop details are stored and synthesized correctly."""
        self.client.force_authenticate(user=self.customer1)
        now = timezone.now()
        payload = {
            "booking_type": "VEHICLE",
            "vehicle_type": "CAR",
            "pickup_details": {
                "house_street": "Flat 402, Royal Residency",
                "area": "Danavaipeta",
                "city": "Rajahmundry",
                "pincode": "533103",
                "landmark": "Opposite SBI Bank",
                "instructions": "Please wait at the gate",
            },
            "drop_details": {
                "house_street": "Terminal 1",
                "area": "Madhurapudi",
                "city": "Rajahmundry",
                "pincode": "533102",
                "landmark": "Near Departure Gate",
            },
            "travel_datetime": (now + timedelta(days=2)).isoformat(),
            "passengers": 3,
            "luggage_type": "MEDIUM",
        }
        res = self.client.post("/api/bookings/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        b = Booking.objects.get(id=res.data["id"])
        self.assertIn("Danavaipeta", b.pickup_location)
        self.assertIn("Opposite Sbi Bank", b.pickup_location)
        self.assertEqual(b.pickup_details["pincode"], "533103")
        self.assertEqual(b.luggage_type, "MEDIUM")

    def test_manager_assignment_rules_customer_selected_vehicle(self):
        """Section 6 & 7: Manager cannot reassign a customer-selected vehicle or mismatch type."""
        # Active car 2
        car2 = Vehicle.objects.create(
            registration_number="AP 05 ZZ 9999",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Honda",
            model="City",
            seating_capacity=4,
            rate_per_km=Decimal("15.00"),
            status=Vehicle.Status.ACTIVE,
        )
        # Create documents for car2 so compliance check passes
        Document.objects.create(
            vehicle=car2,
            doc_type=Document.DocType.INSURANCE,
            review_status=Document.ReviewStatus.APPROVED,
            expiry_date=timezone.localdate() + timedelta(days=365),
        )
        Document.objects.create(
            vehicle=car2,
            doc_type=Document.DocType.REGISTRATION_RC,
            review_status=Document.ReviewStatus.APPROVED,
            expiry_date=timezone.localdate() + timedelta(days=365),
        )

        # Booking with customer selected car
        booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Booking.VehicleType.CAR,
            vehicle=self.car,  # Customer specifically selected self.car
            pickup_location="Origin Point",
            drop_location="Drop Point",
            travel_datetime=timezone.now() + timedelta(days=2),
            passengers=2,
            status=Booking.Status.APPROVED,
        )

        driver_profile, _ = Driver.objects.get_or_create(
            user=self.driver,
            defaults={
                "license_number": "DL-AP-101010",
                "license_expiry": timezone.localdate() + timedelta(days=365),
                "status": Driver.Status.ACTIVE,
            },
        )

        self.client.force_authenticate(user=self.fleet_manager)

        # 1. Manager attempts to assign car2 instead of self.car -> must be rejected!
        assign_payload = {
            "booking": booking.id,
            "vehicle": car2.id,  # Different car!
            "driver": driver_profile.id,
            "source": booking.pickup_location,
            "destination": booking.drop_location,
            "scheduled_datetime": booking.travel_datetime.isoformat(),
        }
        res = self.client.post("/api/trips/assign/", assign_payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Customer specifically selected vehicle", res.data["detail"])

        # 2. Manager assigns self.car (the customer-selected vehicle) -> succeeds!
        assign_payload["vehicle"] = self.car.id
        res2 = self.client.post("/api/trips/assign/", assign_payload)
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)

    def test_expired_bus_schedule_lifecycle_and_customer_protection(self):
        """Bus schedules whose departure has passed are marked EXPIRED, hidden from customers, and cannot be booked."""
        from bookings.services import sync_expired_bus_schedules

        # 1. Create a bus schedule in the past
        past_dep = timezone.now() - timedelta(hours=2)
        past_schedule = BusSchedule.objects.create(
            vehicle=self.bus,
            source="Kakinada",
            destination="Visakhapatnam",
            departure_datetime=past_dep,
            fare_per_seat=Decimal("350.00"),
            status=BusSchedule.Status.OPEN,
            created_by=self.fleet_manager,
        )

        # Also create a previous booking by customer1 to verify preservation
        prev_booking = Booking.objects.create(
            customer=self.customer1,
            booking_type=Booking.BookingType.BUS_SEAT,
            bus_schedule=past_schedule,
            vehicle_type=Booking.VehicleType.BUS,
            vehicle=self.bus,
            pickup_location="Kakinada",
            drop_location="Visakhapatnam",
            travel_datetime=past_dep,
            passengers=2,
            status=Booking.Status.APPROVED,
        )

        # Run sync
        result = sync_expired_bus_schedules()
        self.assertGreaterEqual(result["expired_schedules"], 1)

        past_schedule.refresh_from_db()
        self.assertEqual(past_schedule.status, BusSchedule.Status.EXPIRED)
        self.assertTrue(past_schedule.is_expired)

        # Verify previous booking is completely preserved
        prev_booking.refresh_from_db()
        self.assertEqual(prev_booking.status, Booking.Status.APPROVED)
        self.assertEqual(prev_booking.passengers, 2)

        # 2. Customer listing schedules does not see past_schedule
        self.client.force_authenticate(user=self.customer2)
        c_res = self.client.get("/api/bus-schedules/")
        self.assertEqual(c_res.status_code, status.HTTP_200_OK)
        ids = [s["id"] for s in c_res.data["results"]]
        self.assertNotIn(past_schedule.id, ids)

        # 3. Customer attempts to book the expired schedule -> 400 rejected
        book_res = self.client.post("/api/bookings/", {
            "booking_type": "BUS_SEAT",
            "bus_schedule": past_schedule.id,
            "passengers": 1,
        })
        self.assertEqual(book_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", str(book_res.data).lower())

        # 4. Manager/Admin can view expired schedules
        self.client.force_authenticate(user=self.fleet_manager)
        m_res = self.client.get("/api/bus-schedules/?status=EXPIRED")
        self.assertEqual(m_res.status_code, status.HTTP_200_OK)
        exp_ids = [s["id"] for s in m_res.data["results"]]
        self.assertIn(past_schedule.id, exp_ids)

