from decimal import Decimal
import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import timedelta
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from bookings.models import Booking
from trips.models import GeoCache


def resolve_odometer_and_distance(trip, end_odometer=None, distance_km=None):
    """
    Validates and resolves end_odometer and distance_km for a trip.
    Returns (end_odometer: int, distance_km: Decimal).
    """
    start_odo = trip.start_odometer or 0

    if end_odometer is None and distance_km is None:
        raise ValidationError({
            "end_odometer": "Either end_odometer or distance_km must be provided."
        })

    if end_odometer is not None:
        try:
            end_odometer = int(end_odometer)
        except (ValueError, TypeError):
            raise ValidationError({"end_odometer": "end_odometer must be a valid integer."})

    if distance_km is not None:
        try:
            distance_km = Decimal(str(distance_km))
        except Exception:
            raise ValidationError({"distance_km": "distance_km must be a valid number."})

    # Derive missing value
    if end_odometer is not None and distance_km is None:
        distance_km = Decimal(str(end_odometer - start_odo))
    elif distance_km is not None and end_odometer is None:
        end_odometer = start_odo + int(round(float(distance_km)))

    # If both provided, verify they agree within 0.2 km
    derived_dist = Decimal(str(end_odometer - start_odo))
    if abs(derived_dist - distance_km) > Decimal("0.2"):
        raise ValidationError({
            "distance_km": f"end_odometer ({end_odometer}) and distance_km ({distance_km}) do not agree within 0.2 km."
        })

    # Validate end_odometer > start_odometer and distance_km > 0
    if end_odometer <= start_odo:
        raise ValidationError({
            "end_odometer": f"end_odometer ({end_odometer}) must be strictly greater than start_odometer ({start_odo})."
        })

    if distance_km <= Decimal("0"):
        raise ValidationError({
            "distance_km": "distance_km must be strictly greater than 0."
        })

    return end_odometer, distance_km


def calculate_trip_fare(trip, end_odometer=None, distance_km=None, additional_charges=Decimal("0.00")):
    """
    Authoritative server-side fare calculation for a trip.
    Used by both GET /api/trips/{id}/fare-preview/ and POST /api/trips/{id}/complete/.
    Returns dict:
      {
        "start_odometer": int,
        "end_odometer": int,
        "distance_km": Decimal,
        "rate_per_km": Decimal,
        "base_fare": Decimal,
        "distance_fare": Decimal,
        "additional_charges": Decimal,
        "fare": Decimal,
        "breakdown": str
      }
    """
    end_odo, dist_km = resolve_odometer_and_distance(trip, end_odometer, distance_km)

    try:
        extra = Decimal(str(additional_charges or "0.00"))
        if extra < Decimal("0.00"):
            extra = Decimal("0.00")
    except Exception:
        extra = Decimal("0.00")

    if trip.booking:
        rate = trip.vehicle.rate_per_km if trip.vehicle and trip.vehicle.rate_per_km else Decimal("0.00")
        distance_fare = (dist_km * rate).quantize(Decimal("0.01"))
        base_fare = getattr(trip.booking, "base_fare", None) or Decimal("0.00")
        fare = (distance_fare + extra).quantize(Decimal("0.01"))
        breakdown = f"{dist_km} km x Rs. {rate}/km" + (f" + Rs. {extra} charges" if extra > 0 else "") + f" = Rs. {fare}"
    elif trip.bus_schedule:
        rate = Decimal("0.00")
        active_bookings = trip.bus_schedule.bookings.exclude(
            status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
        )
        distance_fare = sum((b.estimated_fare for b in active_bookings), Decimal("0.00")).quantize(Decimal("0.01"))
        base_fare = Decimal("0.00")
        fare = (distance_fare + extra).quantize(Decimal("0.01"))
        breakdown = f"Bus schedule fares" + (f" + Rs. {extra} charges" if extra > 0 else "") + f" = Rs. {fare}"
    else:
        rate = trip.vehicle.rate_per_km if trip.vehicle and trip.vehicle.rate_per_km else Decimal("0.00")
        distance_fare = (dist_km * rate).quantize(Decimal("0.01"))
        base_fare = Decimal("0.00")
        fare = (distance_fare + extra).quantize(Decimal("0.01"))
        breakdown = f"{dist_km} km x Rs. {rate}/km" + (f" + Rs. {extra} charges" if extra > 0 else "") + f" = Rs. {fare}"

    return {
        "start_odometer": trip.start_odometer or 0,
        "end_odometer": end_odo,
        "distance_km": dist_km,
        "rate_per_km": rate,
        "base_fare": base_fare,
        "distance_fare": distance_fare,
        "additional_charges": extra,
        "fare": fare,
        "breakdown": breakdown,
    }


# =============================================================================
# GEOCODING, ROUTING AND TELEMETRY SERVICES
# =============================================================================

_nominatim_lock = threading.Lock()
_last_nominatim_time = 0.0


def haversine_distance_km(lat1, lon1, lat2, lon2):
    """Calculates great-circle distance between two points on Earth in km."""
    R = 6371.0
    dlat = math.radians(float(lat2) - float(lat1))
    dlon = math.radians(float(lon2) - float(lon1))
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(float(lat1)))
        * math.cos(math.radians(float(lat2)))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return R * c


def project_point_onto_segment(px, py, x1, y1, x2, y2):
    """
    Projects point P(px=lon, py=lat) onto line segment from (x1=lon, y1=lat) to (x2=lon, y2=lat).
    Returns (t_clamped, dist_to_seg_km, travelled_in_seg_km, (proj_x, proj_y)).
    """
    mid_lat = math.radians((y1 + y2) / 2.0)
    kx = 111.320 * math.cos(mid_lat)
    ky = 110.574

    dx = (x2 - x1) * kx
    dy = (y2 - y1) * ky
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq < 1e-9:
        dist_km = math.hypot((px - x1) * kx, (py - y1) * ky)
        return 0.0, dist_km, 0.0, (x1, y1)

    t = ((px - x1) * kx * dx + (py - y1) * ky * dy) / seg_len_sq
    t_clamped = max(0.0, min(1.0, t))

    proj_x = x1 + t_clamped * (x2 - x1)
    proj_y = y1 + t_clamped * (y2 - y1)
    dist_km = math.hypot((px - proj_x) * kx, (py - proj_y) * ky)
    seg_dist_km = math.sqrt(seg_len_sq)
    travelled_in_seg_km = t_clamped * seg_dist_km

    return t_clamped, dist_km, travelled_in_seg_km, (proj_x, proj_y)


def compute_route_progress(route_geojson, current_lat, current_lng):
    """
    Calculates progress percentage, distance remaining, and off-route detection
    relative to planned route GeoJSON geometry.
    """
    if not route_geojson or not isinstance(route_geojson, dict):
        return {
            "progress_percent": 0,
            "distance_left_km": 0.0,
            "is_off_route": False,
            "travelled_km": 0.0,
            "total_distance_km": 0.0,
            "min_dist_to_route_m": 0.0,
        }

    coords = route_geojson.get("coordinates", [])
    if len(coords) < 2:
        return {
            "progress_percent": 0,
            "distance_left_km": 0.0,
            "is_off_route": False,
            "travelled_km": 0.0,
            "total_distance_km": 0.0,
            "min_dist_to_route_m": 0.0,
        }

    seg_lengths = []
    total_km = 0.0
    for i in range(len(coords) - 1):
        x1, y1 = float(coords[i][0]), float(coords[i][1])
        x2, y2 = float(coords[i + 1][0]), float(coords[i + 1][1])
        d = haversine_distance_km(y1, x1, y2, x2)
        seg_lengths.append(d)
        total_km += d

    if total_km < 0.001:
        return {
            "progress_percent": 100,
            "distance_left_km": 0.0,
            "is_off_route": False,
            "travelled_km": 0.0,
            "total_distance_km": 0.0,
            "min_dist_to_route_m": 0.0,
        }

    min_dist_to_route_km = float("inf")
    best_travelled_km = 0.0
    cum_km = 0.0

    c_lat, c_lng = float(current_lat), float(current_lng)

    for i in range(len(coords) - 1):
        x1, y1 = float(coords[i][0]), float(coords[i][1])
        x2, y2 = float(coords[i + 1][0]), float(coords[i + 1][1])
        t_clamped, dist_to_seg_km, travelled_in_seg, _ = project_point_onto_segment(
            c_lng, c_lat, x1, y1, x2, y2
        )

        if dist_to_seg_km < min_dist_to_route_km:
            min_dist_to_route_km = dist_to_seg_km
            best_travelled_km = cum_km + travelled_in_seg

        cum_km += seg_lengths[i]

    # Off route if vehicle is more than 500 meters from route
    min_dist_m = min_dist_to_route_km * 1000.0
    is_off_route = min_dist_m > 500.0
    progress_pct = max(0, min(100, int(round((best_travelled_km / total_km) * 100.0))))
    left_km = max(0.0, round(total_km - best_travelled_km, 2))

    return {
        "progress_percent": progress_pct,
        "distance_left_km": left_km,
        "is_off_route": is_off_route,
        "travelled_km": round(best_travelled_km, 2),
        "total_distance_km": round(total_km, 2),
        "min_dist_to_route_m": round(min_dist_m, 1),
    }


def geocode_place(query_text):
    """
    Geocodes a place name into (lat, lng, display_name).
    Uses 90-day GeoCache with rate-limited Nominatim fallback (max 1 req/sec).
    """
    if not query_text or not str(query_text).strip():
        return None

    norm_query = " ".join(str(query_text).strip().lower().split())

    # 1. Check GeoCache
    cached = GeoCache.objects.filter(query_text=norm_query).first()
    if cached:
        # Cache for 90 days
        if timezone.now() - cached.fetched_at < timedelta(days=90):
            return {
                "lat": cached.lat,
                "lng": cached.lng,
                "display_name": cached.display_name,
                "provider": cached.provider,
                "cached": True,
            }

    # 2. Query Nominatim with rate limiting (at most 1 request per second)
    global _last_nominatim_time
    with _nominatim_lock:
        now = time.time()
        elapsed = now - _last_nominatim_time
        if elapsed < 1.05:
            time.sleep(1.05 - elapsed)
        _last_nominatim_time = time.time()

        user_agent = os.environ.get("GEO_USER_AGENT", "FleetFlow/1.0 (fleetflow@example.com)")
        contact_email = os.environ.get("GEO_CONTACT_EMAIL", "admin@fleetflow.com")

        params = {
            "q": query_text,
            "format": "json",
            "countrycodes": "in",
            "limit": "1",
            "viewbox": "76.7,19.9,84.8,12.6",  # Andhra Pradesh and neighbouring states bias
            "bounded": "0",
        }
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": user_agent,
                "From": contact_email,
                "Accept": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data and isinstance(data, list) and len(data) > 0:
                    first = data[0]
                    lat = Decimal(str(round(float(first["lat"]), 6)))
                    lng = Decimal(str(round(float(first["lon"]), 6)))
                    display_name = str(first.get("display_name", ""))[:500]

                    geo_obj, _ = GeoCache.objects.update_or_create(
                        query_text=norm_query,
                        defaults={
                            "lat": lat,
                            "lng": lng,
                            "display_name": display_name,
                            "provider": "nominatim",
                        },
                    )
                    return {
                        "lat": geo_obj.lat,
                        "lng": geo_obj.lng,
                        "display_name": geo_obj.display_name,
                        "provider": "nominatim",
                        "cached": False,
                    }
        except Exception:
            pass

    return None


def fetch_osrm_route(pickup_lat, pickup_lng, drop_lat, drop_lng):
    """
    Fetches driving route GeoJSON from OSRM demo server (or custom OSRM_URL).
    Falls back to straight dashed line geometry on routing or network error.
    """
    osrm_base = os.environ.get("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
    url = f"{osrm_base}/route/v1/driving/{pickup_lng},{pickup_lat};{drop_lng},{drop_lat}?overview=full&geometries=geojson"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": os.environ.get("GEO_USER_AGENT", "FleetFlow/1.0"),
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("code") == "Ok" and data.get("routes"):
                r = data["routes"][0]
                dist_km = Decimal(str(round(r["distance"] / 1000.0, 2)))
                dur_min = max(1, int(round(r["duration"] / 60.0)))
                geojson = r["geometry"]
                return {
                    "route_geojson": geojson,
                    "route_distance_km": dist_km,
                    "route_duration_min": dur_min,
                    "route_source": "OSRM",
                    "geo_status": "OK",
                }
    except Exception:
        pass

    # Fallback to straight dashed line
    straight_dist = Decimal(str(round(haversine_distance_km(pickup_lat, pickup_lng, drop_lat, drop_lng), 2)))
    straight_dur = max(5, int(round(float(straight_dist) * 2.0)))  # ~30 km/h estimate
    straight_geojson = {
        "type": "LineString",
        "coordinates": [
            [float(pickup_lng), float(pickup_lat)],
            [float(drop_lng), float(drop_lat)],
        ],
    }
    return {
        "route_geojson": straight_geojson,
        "route_distance_km": straight_dist,
        "route_duration_min": straight_dur,
        "route_source": "STRAIGHT",
        "geo_status": "APPROXIMATE",
    }


def resolve_trip_route(trip, force_recompute=False):
    """
    Resolves pickup and drop coordinates and route GeoJSON for a Trip.
    Can be run synchronously or in background threads.
    """
    needs_pickup = trip.pickup_lat is None or trip.pickup_lng is None
    needs_drop = trip.drop_lat is None or trip.drop_lng is None

    if needs_pickup and trip.source:
        p_res = geocode_place(trip.source)
        if p_res:
            trip.pickup_lat = p_res["lat"]
            trip.pickup_lng = p_res["lng"]

    if needs_drop and trip.destination:
        d_res = geocode_place(trip.destination)
        if d_res:
            trip.drop_lat = d_res["lat"]
            trip.drop_lng = d_res["lng"]

    if (
        trip.pickup_lat is not None
        and trip.pickup_lng is not None
        and trip.drop_lat is not None
        and trip.drop_lng is not None
    ):
        if not trip.route_geojson or force_recompute:
            route_res = fetch_osrm_route(
                trip.pickup_lat, trip.pickup_lng, trip.drop_lat, trip.drop_lng
            )
            trip.route_geojson = route_res["route_geojson"]
            trip.route_distance_km = route_res["route_distance_km"]
            trip.route_duration_min = route_res["route_duration_min"]
            trip.route_source = route_res["route_source"]
            if trip.geo_status != "MANUAL":
                trip.geo_status = route_res["geo_status"]
    else:
        trip.geo_status = "FAILED"

    trip.save(
        update_fields=[
            "pickup_lat",
            "pickup_lng",
            "drop_lat",
            "drop_lng",
            "route_geojson",
            "route_distance_km",
            "route_duration_min",
            "route_source",
            "geo_status",
        ]
    )
    return trip


def resolve_trip_route_async(trip_id, timeout=4.0):
    """
    Fires off trip geocoding and route calculation in a background thread
    so assignment and request flows are never delayed.
    """
    from trips.models import Trip

    def _worker():
        try:
            t = Trip.objects.filter(id=trip_id).first()
            if t:
                resolve_trip_route(t)
        except Exception:
            pass

    th = threading.Thread(target=_worker, daemon=True)
    th.start()


def compute_trip_eta_minutes(trip, distance_left_km):
    """
    Computes remaining travel time in minutes based on:
    - Average speed of last 5 minutes (clamped to at least 20 km/h)
    - Fallback to route_duration_min or estimated speed (30 km/h)
    """
    if distance_left_km <= 0.05:
        return 0

    five_min_ago = timezone.now() - timedelta(minutes=5)
    recent_locs = list(
        trip.locations.filter(recorded_at__gte=five_min_ago).order_by("recorded_at")
    )

    if len(recent_locs) >= 2:
        # Calculate speed from points or average reported speed_kmh
        valid_speeds = [l.speed_kmh for l in recent_locs if l.speed_kmh is not None and l.speed_kmh > 0]
        if valid_speeds:
            avg_speed = sum(valid_speeds) / len(valid_speeds)
        else:
            p1 = recent_locs[0]
            p2 = recent_locs[-1]
            dist_km = haversine_distance_km(p1.latitude, p1.longitude, p2.latitude, p2.longitude)
            delta_hours = max(0.0001, (p2.recorded_at - p1.recorded_at).total_seconds() / 3600.0)
            avg_speed = dist_km / delta_hours

        effective_speed = max(20.0, avg_speed)
        return max(1, int(round((distance_left_km / effective_speed) * 60.0)))

    # Fallback to route duration proportional to remaining distance
    if trip.route_duration_min and trip.route_distance_km and float(trip.route_distance_km) > 0:
        ratio = min(1.0, distance_left_km / float(trip.route_distance_km))
        return max(1, int(round(ratio * trip.route_duration_min)))

    return max(1, int(round((distance_left_km / 30.0) * 60.0)))

