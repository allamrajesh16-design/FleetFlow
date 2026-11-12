from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from documents.models import Document
from drivers.models import Driver
from trips.models import Trip
from vehicles.models import Vehicle, Maintenance


def trip_time_window(start_datetime, distance_km=None):
    """
    Calculate the start and estimated end of a trip.
    Rule: booking time to estimated end: distance / 40 km per hour plus 1 hour, default 3 hours.
    """
    if distance_km and distance_km > 0:
        duration_hours = (float(distance_km) / 40.0) + 1.0
    else:
        duration_hours = 3.0

    end_datetime = start_datetime + timedelta(hours=duration_hours)
    return start_datetime, end_datetime


def is_vehicle_free(
    vehicle,
    start_datetime,
    end_datetime,
    booking=None,
    bus_schedule=None,
    maintenance_vehicle_ids=None,
    expired_doc_vehicle_ids=None,
    vehicle_trips=None,
    exclude_trip_id=None,
):
    """
    A vehicle is available when:
    - ACTIVE
    - same type as the booking (a bus schedule uses its own bus)
    - seats are at least the passengers
    - no SCHEDULED or IN_PROGRESS trip overlaps the time window (excluding exclude_trip_id)
    - not in MAINTENANCE
    - no expired approved Insurance or Registration (RC) document
    Returns (is_available: bool, reason: str or None)
    """
    if vehicle.status != Vehicle.Status.ACTIVE:
        return False, f"Vehicle is not active (current status: {vehicle.status})"

    # Check vehicle type and seats
    if booking:
        if vehicle.vehicle_type != booking.vehicle_type:
            return False, f"Vehicle type {vehicle.vehicle_type} does not match booking vehicle type {booking.vehicle_type}"
        if booking.passengers and vehicle.seating_capacity < booking.passengers:
            return False, f"Seats {vehicle.seating_capacity} < passengers {booking.passengers}"
    elif bus_schedule:
        if vehicle != bus_schedule.vehicle:
            return False, "Vehicle must match the vehicle assigned to the bus schedule"

    # Check active Maintenance (use preloaded set if available)
    if maintenance_vehicle_ids is not None:
        has_maintenance = vehicle.id in maintenance_vehicle_ids
    else:
        has_maintenance = Maintenance.objects.filter(
            vehicle=vehicle,
            status__in=[Maintenance.Status.SCHEDULED, Maintenance.Status.IN_PROGRESS],
            scheduled_date__lte=end_datetime.date(),
        ).exists()
    if has_maintenance:
        return False, "Vehicle is currently under maintenance"

    # Check expired approved Insurance or Registration (RC)
    if getattr(settings, "BLOCK_TRIPS_ON_EXPIRED_DOCUMENTS", True):
        if expired_doc_vehicle_ids is not None:
            if vehicle.id in expired_doc_vehicle_ids:
                return False, "Insurance or RC document expired"
        else:
            today = timezone.localdate()
            expired_docs = Document.objects.filter(
                vehicle=vehicle,
                review_status=Document.ReviewStatus.APPROVED,
                doc_type__in=[Document.DocType.INSURANCE, Document.DocType.REGISTRATION_RC],
                expiry_date__lt=today,
            )
            if expired_docs.exists():
                doc_names = ", ".join(d.get_doc_type_display() for d in expired_docs)
                return False, f"{doc_names} expired"

    # Check overlapping SCHEDULED or IN_PROGRESS trips (use preloaded list if available)
    if vehicle_trips is not None:
        overlapping_trips = vehicle_trips.get(vehicle.id, [])
    else:
        overlapping_trips = Trip.objects.filter(
            vehicle=vehicle,
            status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS],
        )

    for t in overlapping_trips:
        if exclude_trip_id and t.id == exclude_trip_id:
            continue
        bkg = t.booking
        t_dist = (getattr(bkg, "estimated_distance_km", None) or getattr(bkg, "distance_km", None)) if bkg else None
        t_start, t_end = trip_time_window(t.scheduled_datetime, t_dist)
        if (t_start <= end_datetime) and (t_end >= start_datetime):
            time_str = t_end.strftime("%I:%M %p")
            return False, f"On a trip until {time_str}"

    return True, None


def is_driver_free(driver, start_datetime, end_datetime, driver_trips=None, exclude_trip_id=None):
    """
    A driver is available when:
    - ACTIVE
    - licence valid until after the trip date
    - not ON_TRIP (no active IN_PROGRESS trip, except exclude_trip_id)
    - no overlapping scheduled trip (excluding exclude_trip_id)
    Returns (is_available: bool, reason: str or None)
    """
    if driver.status != Driver.Status.ACTIVE:
        return False, f"Driver is not active (current status: {driver.status})"

    if driver.license_expiry < end_datetime.date():
        return False, f"Licence expires before the trip ({driver.license_expiry})"

    if driver_trips is not None:
        trips_list = driver_trips.get(driver.id, [])
        # Check if driver has any IN_PROGRESS trip (other than exclude_trip_id)
        if any(t.status == Trip.Status.IN_PROGRESS and (not exclude_trip_id or t.id != exclude_trip_id) for t in trips_list):
            return False, "Driver is currently on a trip"
        overlapping_trips = trips_list
    else:
        ip_qs = Trip.objects.filter(driver=driver, status=Trip.Status.IN_PROGRESS)
        if exclude_trip_id:
            ip_qs = ip_qs.exclude(id=exclude_trip_id)
        if ip_qs.exists():
            return False, "Driver is currently on a trip"
        overlapping_trips = Trip.objects.filter(
            driver=driver,
            status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS],
        )

    for t in overlapping_trips:
        if exclude_trip_id and t.id == exclude_trip_id:
            continue
        bkg = t.booking
        t_dist = (getattr(bkg, "estimated_distance_km", None) or getattr(bkg, "distance_km", None)) if bkg else None
        t_start, t_end = trip_time_window(t.scheduled_datetime, t_dist)
        if (t_start <= end_datetime) and (t_end >= start_datetime):
            time_str = t_end.strftime("%I:%M %p")
            return False, f"On a trip until {time_str}"

    return True, None


def get_recommended_assignment(
    booking,
    bus_schedule,
    free_vehicles,
    free_drivers,
    start_dt,
    end_dt,
    vehicle_trips_today=None,
    driver_trips_today=None,
    maintenances_next_24h_ids=None,
):
    """
    Calculate the recommended vehicle and driver for a booking/bus schedule.
    Returns:
    {
        "vehicle_id": int or None,
        "driver_id": int or None,
        "reasons": list of str,
        "vehicle_reasons": list of str,
        "driver_reasons": list of str,
        "driver_hours_warning": bool,
    }
    """
    passengers = booking.passengers if booking else (bus_schedule.vehicle.seating_capacity if bus_schedule and bus_schedule.vehicle else 40)
    trip_date = start_dt.date()

    # Pre-calculate counts if not supplied
    if vehicle_trips_today is None:
        vehicle_trips_today = {}
        for t in Trip.objects.filter(scheduled_datetime__date=trip_date).values("vehicle_id"):
            vid = t["vehicle_id"]
            vehicle_trips_today[vid] = vehicle_trips_today.get(vid, 0) + 1

    if driver_trips_today is None:
        driver_trips_today = {}
        for t in Trip.objects.filter(scheduled_datetime__date=trip_date).select_related("booking"):
            did = t.driver_id
            bkg = t.booking
            dist = (getattr(bkg, "estimated_distance_km", None) or getattr(bkg, "distance_km", None)) if bkg else None
            w_start, w_end = trip_time_window(t.scheduled_datetime, dist)
            duration_hrs = (w_end - w_start).total_seconds() / 3600.0
            if did not in driver_trips_today:
                driver_trips_today[did] = {"count": 0, "hours": 0.0}
            driver_trips_today[did]["count"] += 1
            driver_trips_today[did]["hours"] += duration_hrs

    if maintenances_next_24h_ids is None:
        maintenances_next_24h_ids = set(
            Maintenance.objects.filter(
                status__in=[Maintenance.Status.SCHEDULED, Maintenance.Status.IN_PROGRESS],
                scheduled_date__gte=trip_date,
                scheduled_date__lte=trip_date + timedelta(days=1),
            ).values_list("vehicle_id", flat=True)
        )

    # 1. Score Vehicles
    best_vehicle = None
    best_vehicle_score = None
    vehicle_reasons = []

    for v in free_vehicles:
        # Smallest capacity >= passengers (waste penalty)
        cap = v.seating_capacity or 4
        capacity_waste = cap - passengers
        if capacity_waste < 0:
            continue
        has_maint_24h = v.id in maintenances_next_24h_ids
        trips_today = vehicle_trips_today.get(v.id, 0)
        rate = float(v.rate_per_km or 0.0)

        # Vehicle score tuple for sorting (lower is better):
        # 1. Maintenance in next 24h (0 = no, 1 = yes)
        # 2. Capacity waste (smallest fitting first)
        # 3. Trips today (fewer first)
        # 4. Rate per km (lower rate as tie-break)
        v_score = (1 if has_maint_24h else 0, capacity_waste, trips_today, rate)

        if best_vehicle_score is None or v_score < best_vehicle_score:
            best_vehicle_score = v_score
            best_vehicle = v

    if best_vehicle:
        v_trips = vehicle_trips_today.get(best_vehicle.id, 0)
        if v_trips == 0:
            vehicle_reasons.append("Free all day")
        else:
            vehicle_reasons.append(f"{v_trips} trip today" if v_trips == 1 else f"{v_trips} trips today")

        vehicle_reasons.append(f"Seats {best_vehicle.seating_capacity} for {passengers} passengers")
        if best_vehicle.id not in maintenances_next_24h_ids:
            vehicle_reasons.append("No service due this week")

    # 2. Score Drivers
    best_driver = None
    best_driver_score = None
    driver_reasons = []
    driver_hours_warning = False

    for d in free_drivers:
        d_stats = driver_trips_today.get(d.id, {"count": 0, "hours": 0.0})
        trips_today = d_stats["count"]
        hours_today = d_stats["hours"]

        # Licence valid > 30 days after the trip
        lic_valid_30d = d.license_expiry >= (trip_date + timedelta(days=30))

        # Driver score tuple for sorting (lower is better):
        # 1. Licence valid >30d (0 = valid >30d, 1 = ends within 30d)
        # 2. Trips today (fewer first)
        # 3. Hours already scheduled today (fewer first)
        d_score = (0 if lic_valid_30d else 1, trips_today, hours_today)

        if best_driver_score is None or d_score < best_driver_score:
            best_driver_score = d_score
            best_driver = d

    if best_driver:
        d_stats = driver_trips_today.get(best_driver.id, {"count": 0, "hours": 0.0})
        trips_today = d_stats["count"]
        hours_today = d_stats["hours"]

        if trips_today == 0:
            driver_reasons.append("Free all day")
        else:
            driver_reasons.append(f"{trips_today} trip today" if trips_today == 1 else f"{trips_today} trips today")

        if best_driver.license_expiry:
            driver_reasons.append(f"Licence valid until {best_driver.license_expiry.strftime('%Y')}")

        if hours_today >= 9.0:
            driver_hours_warning = True
            driver_reasons.append(f"Warning: {round(hours_today, 1)}h scheduled today")

    combined_reasons = vehicle_reasons + driver_reasons

    return {
        "vehicle_id": best_vehicle.id if best_vehicle else None,
        "driver_id": best_driver.id if best_driver else None,
        "reasons": combined_reasons,
        "vehicle_reasons": vehicle_reasons,
        "driver_reasons": driver_reasons,
        "driver_hours_warning": driver_hours_warning,
    }


