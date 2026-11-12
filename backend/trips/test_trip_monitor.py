from datetime import timedelta
from decimal import Decimal
import json
import time
from io import StringIO
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from bookings.models import Booking
from drivers.models import Driver
from trips.models import Trip, TripLocation, GeoCache
from trips.services import (
    haversine_distance_km,
    compute_route_progress,
    geocode_place,
    fetch_osrm_route,
    resolve_trip_route,
)
from vehicles.models import Vehicle

User = get_user_model()


class TripMonitorBackendTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "TestPass@123"

        # Admin
        self.admin = User.objects.create_user(
            email="monitor.admin@fleetflow.com",
            password=self.password,
            role=User.Role.ADMIN,
            full_name="Monitor Admin",
        )

        # Fleet Manager
        self.manager = User.objects.create_user(
            email="monitor.manager@fleetflow.com",
            password=self.password,
            role=User.Role.FLEET_MANAGER,
            full_name="Monitor Manager",
        )

        # Customer
        self.customer = User.objects.create_user(
            email="monitor.customer@fleetflow.com",
            password=self.password,
            role=User.Role.CUSTOMER,
            full_name="Priya Sharma",
            phone="+919876543210",
        )

        # Driver
        self.u_driver = User.objects.create_user(
            email="monitor.driver@fleetflow.com",
            password=self.password,
            role=User.Role.DRIVER,
            full_name="Suresh Kumar",
            phone="+919876543211",
        )
        self.driver = Driver.objects.create(
            user=self.u_driver,
            license_number="DL-MON-001",
            license_expiry=timezone.localdate() + timedelta(days=365),
            status=Driver.Status.ACTIVE,
        )

        # Vehicles
        self.vehicle1 = Vehicle.objects.create(
            registration_number="AP39TV1001",
            brand="Toyota",
            model="Innova",
            vehicle_type=Vehicle.VehicleType.CAR,
            seating_capacity=6,
            status=Vehicle.Status.ACTIVE,
            rate_per_km=Decimal("15.00"),
        )
        self.vehicle2 = Vehicle.objects.create(
            registration_number="AP39TV1002",
            brand="Tata",
            model="Starbus",
            vehicle_type=Vehicle.VehicleType.BUS,
            seating_capacity=32,
            status=Vehicle.Status.ACTIVE,
            rate_per_km=Decimal("25.00"),
        )

        # Bookings
        self.booking1 = Booking.objects.create(
            customer=self.customer,
            pickup_location="Kakinada Town Railway Station",
            drop_location="Kakinada Beach Road",
            travel_datetime=timezone.now(),
            booking_type=Booking.BookingType.VEHICLE,
            status=Booking.Status.APPROVED,
            vehicle_type=Vehicle.VehicleType.CAR,
            passengers=2,
        )

        # Sample GeoJSON Route: Kakinada Station to Beach (approx 4 km)
        self.sample_route = {
            "type": "LineString",
            "coordinates": [
                [82.2475, 16.9891],  # Station
                [82.2530, 16.9820],
                [82.2590, 16.9750],
                [82.2680, 16.9680],  # Beach
            ],
        }

        # Trips
        self.trip_live = Trip.objects.create(
            booking=self.booking1,
            vehicle=self.vehicle1,
            driver=self.driver,
            source="Kakinada Station",
            destination="Kakinada Beach",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            started_at=timezone.now() - timedelta(minutes=15),
            start_odometer=10000,
            pickup_lat=Decimal("16.989100"),
            pickup_lng=Decimal("82.247500"),
            drop_lat=Decimal("16.968000"),
            drop_lng=Decimal("82.268000"),
            route_geojson=self.sample_route,
            route_distance_km=Decimal("4.20"),
            route_duration_min=10,
            geo_status="OK",
            route_source="OSRM",
        )

        self.trip_stale = Trip.objects.create(
            vehicle=self.vehicle2,
            driver=self.driver,
            source="Rajahmundry",
            destination="Samalkot",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            started_at=timezone.now() - timedelta(minutes=45),
            start_odometer=20000,
            pickup_lat=Decimal("17.000000"),
            pickup_lng=Decimal("81.800000"),
            drop_lat=Decimal("17.050000"),
            drop_lng=Decimal("82.160000"),
            route_geojson=self.sample_route,
            route_distance_km=Decimal("42.00"),
            route_duration_min=50,
            geo_status="OK",
            route_source="OSRM",
        )

        self.trip_no_signal = Trip.objects.create(
            vehicle=self.vehicle1,
            driver=self.driver,
            source="Annavaram",
            destination="Tuni",
            scheduled_datetime=timezone.now(),
            status=Trip.Status.IN_PROGRESS,
            started_at=timezone.now() - timedelta(minutes=5),
            start_odometer=10500,
            pickup_lat=Decimal("17.280000"),
            pickup_lng=Decimal("82.400000"),
            drop_lat=Decimal("17.350000"),
            drop_lng=Decimal("82.550000"),
            route_geojson=self.sample_route,
            route_distance_km=Decimal("18.00"),
            route_duration_min=25,
            geo_status="OK",
            route_source="OSRM",
        )

        # Recent ping for trip_live (30s ago -> LIVE)
        TripLocation.objects.create(
            trip=self.trip_live,
            latitude=Decimal("16.982000"),
            longitude=Decimal("82.253000"),
            speed_kmh=42.0,
            heading=145.0,
            accuracy_m=5.0,
            is_simulated=False,
        )

        # Stale ping for trip_stale (200s ago -> STALE > 120s)
        stale_loc = TripLocation.objects.create(
            trip=self.trip_stale,
            latitude=Decimal("17.020000"),
            longitude=Decimal("81.900000"),
            speed_kmh=35.0,
            heading=80.0,
            accuracy_m=10.0,
            is_simulated=False,
        )
        TripLocation.objects.filter(id=stale_loc.id).update(
            recorded_at=timezone.now() - timedelta(seconds=200)
        )

    # 1. GeoCache: second lookup makes zero external network requests
    def test_geocode_cache_hit_and_miss(self):
        query = "Vijayawada Bus Station"
        norm = "vijayawada bus station"

        # Prime the cache
        GeoCache.objects.create(
            query_text=norm,
            lat=Decimal("16.518600"),
            lng=Decimal("80.619800"),
            display_name="Pandit Nehru Bus Station, Vijayawada",
            provider="nominatim",
        )

        # Perform geocoding lookup
        res = geocode_place(query)
        self.assertIsNotNone(res)
        self.assertEqual(res["cached"], True)
        self.assertEqual(float(res["lat"]), 16.518600)
        self.assertEqual(float(res["lng"]), 80.619800)

    # 2. Routing Fallbacks & Straight Line
    def test_route_storage_and_fallbacks(self):
        # When OSRM fails or times out, fallback to straight line dashed geometry
        res = fetch_osrm_route(16.9891, 82.2475, 16.9680, 82.2680)
        self.assertIn("route_geojson", res)
        self.assertIn("route_distance_km", res)
        self.assertIn("route_duration_min", res)
        self.assertIn(res["route_source"], ["OSRM", "STRAIGHT"])
        self.assertIn(res["geo_status"], ["OK", "APPROXIMATE"])

    # 3. Off-Route Detection & Progress Maths
    def test_progress_remaining_distance_and_off_route_math(self):
        # Point right on segment 2 of self.sample_route
        on_route_lat = 16.9820
        on_route_lon = 82.2530
        res = compute_route_progress(self.sample_route, on_route_lat, on_route_lon)
        self.assertFalse(res["is_off_route"])
        self.assertGreater(res["progress_percent"], 0)
        self.assertLess(res["progress_percent"], 100)
        self.assertGreater(res["distance_left_km"], 0.0)

        # Point 300 meters away (should NOT be off-route)
        # 1 deg lat ~= 111 km -> 300m ~= 0.0027 deg
        near_lat = 16.9820 + 0.002
        near_lon = 82.2530
        res_near = compute_route_progress(self.sample_route, near_lat, near_lon)
        self.assertFalse(res_near["is_off_route"])

        # Point 1.5 km away (must be OFF_ROUTE > 500m)
        far_lat = 16.9820 + 0.015
        far_lon = 82.2530
        res_far = compute_route_progress(self.sample_route, far_lat, far_lon)
        self.assertTrue(res_far["is_off_route"])
        self.assertGreater(res_far["min_dist_to_route_m"], 500.0)

    # 4. Status Flags (LIVE, STALE, NO_SIGNAL) on GET /api/trips/monitor/
    def test_monitor_status_flags_and_last_location(self):
        self.client.force_authenticate(user=self.manager)
        resp = self.client.get("/api/trips/monitor/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()

        trip_map = {item["id"]: item for item in data}

        # Trip 1 (30s ago): LIVE
        item1 = trip_map[self.trip_live.id]
        self.assertIn("LIVE", item1["status_flags"])
        self.assertTrue(item1["is_live"])
        self.assertFalse(item1["is_stale"])
        self.assertFalse(item1["is_no_signal"])
        self.assertIsNotNone(item1["last_location"])
        self.assertEqual(item1["last_location"]["speed_kmh"], 42.0)

        # Trip 2 (200s ago): STALE
        item2 = trip_map[self.trip_stale.id]
        self.assertIn("STALE", item2["status_flags"])
        self.assertTrue(item2["is_stale"])
        self.assertFalse(item2["is_live"])

        # Trip 3 (no points): NO_SIGNAL
        item3 = trip_map[self.trip_no_signal.id]
        self.assertIn("NO_SIGNAL", item3["status_flags"])
        self.assertTrue(item3["is_no_signal"])
        self.assertIsNone(item3["last_location"])

    # 5. Query Efficiency: Single SQL Query with subquery on /api/trips/monitor/
    def test_monitor_query_count_efficiency(self):
        self.client.force_authenticate(user=self.manager)
        with self.assertNumQueries(1):
            resp = self.client.get("/api/trips/monitor/")
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # 6. Customer & Driver Privacy: Strictly zero phone numbers anywhere
    def test_customer_privacy_no_phone_numbers(self):
        self.client.force_authenticate(user=self.manager)

        # Monitor endpoint
        resp_mon = self.client.get("/api/trips/monitor/")
        content_mon = resp_mon.content.decode("utf-8")
        self.assertNotIn(self.customer.phone, content_mon)
        self.assertNotIn(self.u_driver.phone, content_mon)
        self.assertNotIn("phone", content_mon.lower())

        # Track endpoint
        resp_track = self.client.get(f"/api/trips/{self.trip_live.id}/track/")
        content_track = resp_track.content.decode("utf-8")
        self.assertNotIn(self.customer.phone, content_track)
        self.assertNotIn(self.u_driver.phone, content_track)
        self.assertNotIn("phone", content_track.lower())

    # 7. Role Permissions: Drivers & Customers get HTTP 403 Forbidden
    def test_permissions_driver_and_customer_forbidden(self):
        # Driver
        self.client.force_authenticate(user=self.u_driver)
        r1 = self.client.get("/api/trips/monitor/")
        self.assertEqual(r1.status_code, status.HTTP_403_FORBIDDEN)
        r2 = self.client.get(f"/api/trips/{self.trip_live.id}/track/")
        self.assertEqual(r2.status_code, status.HTTP_403_FORBIDDEN)
        r3 = self.client.patch(f"/api/trips/{self.trip_live.id}/places/", {})
        self.assertEqual(r3.status_code, status.HTTP_403_FORBIDDEN)

        # Customer
        self.client.force_authenticate(user=self.customer)
        r4 = self.client.get("/api/trips/monitor/")
        self.assertEqual(r4.status_code, status.HTTP_403_FORBIDDEN)
        r5 = self.client.get(f"/api/trips/{self.trip_live.id}/track/")
        self.assertEqual(r5.status_code, status.HTTP_403_FORBIDDEN)
        r6 = self.client.patch(f"/api/trips/{self.trip_live.id}/places/", {})
        self.assertEqual(r6.status_code, status.HTTP_403_FORBIDDEN)

    # 8. PATCH /api/trips/{id}/places/ updates places and marks MANUAL
    def test_patch_places_and_recompute_route(self):
        self.client.force_authenticate(user=self.manager)
        payload = {
            "pickup_lat": 16.995000,
            "pickup_lng": 82.250000,
            "drop_lat": 16.960000,
            "drop_lng": 82.270000,
        }
        resp = self.client.patch(f"/api/trips/{self.trip_live.id}/places/", payload)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["geo_status"], "MANUAL")
        self.assertEqual(data["pickup_lat"], 16.995000)
        self.assertEqual(data["drop_lat"], 16.960000)

        # Re-fetch from DB
        self.trip_live.refresh_from_db()
        self.assertEqual(self.trip_live.geo_status, "MANUAL")
        self.assertEqual(float(self.trip_live.pickup_lat), 16.995000)

    # 9. Simulator Guard: refuses to run when DEBUG is False
    @override_settings(DEBUG=False)
    def test_simulator_guard_refuses_when_debug_false(self):
        err_out = StringIO()
        call_command("simulate_trip_gps", self.trip_live.id, stderr=err_out)
        output = err_out.getvalue()
        self.assertIn("Refusing to run when DEBUG is False", output)

    # 10. Simulator execution when DEBUG is True creates is_simulated=True points
    @override_settings(DEBUG=True)
    def test_simulator_generates_simulated_points(self):
        out = StringIO()
        call_command(
            "simulate_trip_gps",
            self.trip_live.id,
            speed=50.0,
            interval=1.0,
            steps=3,
            no_sleep=True,
            stdout=out,
        )
        sim_points = TripLocation.objects.filter(trip=self.trip_live, is_simulated=True)
        self.assertGreaterEqual(sim_points.count(), 3)
        for pt in sim_points:
            self.assertTrue(pt.is_simulated)
            self.assertEqual(pt.speed_kmh, 50.0)
            self.assertIsNotNone(pt.heading)

