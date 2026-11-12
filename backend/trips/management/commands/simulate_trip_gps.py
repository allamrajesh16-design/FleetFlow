import math
import time
from decimal import Decimal
from django.conf import settings
from django.core.management.base import BaseCommand
from trips.models import Trip, TripLocation
from trips.services import resolve_trip_route, haversine_distance_km


def calculate_heading(lat1, lon1, lat2, lon2):
    dlon = math.radians(lon2 - lon1)
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    y = math.sin(dlon) * math.cos(lat2_r)
    x = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon)
    bearing = math.degrees(math.atan2(y, x))
    return round((bearing + 360.0) % 360.0, 1)


class Command(BaseCommand):
    help = "Simulates realistic GPS telemetry by walking a vehicle along its planned route."

    def add_arguments(self, parser):
        parser.add_argument("trip_id", type=int, help="Trip ID to simulate")
        parser.add_argument("--speed", type=float, default=40.0, help="Simulation speed in km/h (default: 40)")
        parser.add_argument("--interval", type=float, default=2.0, help="Ping interval in seconds (default: 2)")
        parser.add_argument("--steps", type=int, default=0, help="Max steps to generate (0 for entire route)")
        parser.add_argument("--no-sleep", action="store_true", help="Do not sleep between steps (for fast testing)")

    def handle(self, *args, **options):
        # Development only check
        if not getattr(settings, "DEBUG", False):
            self.stderr.write(
                self.style.ERROR(
                    "WARNING: simulate_trip_gps is strictly for development and demo environments. "
                    "Refusing to run when DEBUG is False."
                )
            )
            return

        trip_id = options["trip_id"]
        speed = options["speed"]
        interval = options["interval"]
        max_steps = options["steps"]
        no_sleep = options["no_sleep"]

        try:
            trip = Trip.objects.get(id=trip_id)
        except Trip.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Trip #{trip_id} does not exist."))
            return

        # Ensure route exists
        if not trip.route_geojson or not trip.route_geojson.get("coordinates"):
            self.stdout.write(f"Trip #{trip_id} lacks route geometry. Resolving places and route...")
            resolve_trip_route(trip)
            trip.refresh_from_db()

        coords = trip.route_geojson.get("coordinates", [])
        if len(coords) < 2:
            self.stderr.write(self.style.ERROR(f"Trip #{trip_id} route coordinates could not be resolved."))
            return

        # Convert coords [[lon, lat], ...] to list of (lat, lon)
        path = [(float(c[1]), float(c[0])) for c in coords]
        total_dist_km = sum(
            haversine_distance_km(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])
            for i in range(len(path) - 1)
        )

        step_dist_km = (speed / 3600.0) * interval
        self.stdout.write(
            self.style.SUCCESS(
                f"Starting GPS simulation for Trip #{trip.id} ({trip.vehicle.registration_number}):\n"
                f"  Route: {trip.source} -> {trip.destination}\n"
                f"  Total Distance: {total_dist_km:.2f} km\n"
                f"  Speed: {speed} km/h | Interval: {interval}s | Step: {step_dist_km * 1000:.1f}m"
            )
        )

        curr_seg_idx = 0
        curr_lat, curr_lon = path[0]
        step_count = 0

        while curr_seg_idx < len(path) - 1:
            p_next_lat, p_next_lon = path[curr_seg_idx + 1]
            seg_dist = haversine_distance_km(curr_lat, curr_lon, p_next_lat, p_next_lon)

            heading = calculate_heading(curr_lat, curr_lon, p_next_lat, p_next_lon)

            # Record point
            TripLocation.objects.create(
                trip=trip,
                latitude=Decimal(str(round(curr_lat, 6))),
                longitude=Decimal(str(round(curr_lon, 6))),
                speed_kmh=speed,
                heading=heading,
                accuracy_m=5.0,
                is_simulated=True,
            )
            step_count += 1
            self.stdout.write(
                f"Step {step_count}: ({curr_lat:.6f}, {curr_lon:.6f}) Heading: {heading}° Speed: {speed} km/h"
            )

            if max_steps > 0 and step_count >= max_steps:
                self.stdout.write(self.style.SUCCESS(f"Reached requested limit of {max_steps} steps."))
                break

            if not no_sleep:
                time.sleep(interval)

            if step_dist_km >= seg_dist:
                # Advance to next segment
                curr_lat, curr_lon = p_next_lat, p_next_lon
                curr_seg_idx += 1
            else:
                # Advance along current segment
                ratio = step_dist_km / max(0.0001, seg_dist)
                curr_lat += (p_next_lat - curr_lat) * ratio
                curr_lon += (p_next_lon - curr_lon) * ratio

        # Final destination point
        if max_steps == 0 or step_count < max_steps:
            final_lat, final_lon = path[-1]
            TripLocation.objects.create(
                trip=trip,
                latitude=Decimal(str(round(final_lat, 6))),
                longitude=Decimal(str(round(final_lon, 6))),
                speed_kmh=0.0,
                heading=0.0,
                accuracy_m=3.0,
                is_simulated=True,
            )
            self.stdout.write(self.style.SUCCESS(f"Vehicle reached destination at ({final_lat:.6f}, {final_lon:.6f})."))

