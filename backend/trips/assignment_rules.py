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
):
    """
    A vehicle is available when:
    - ACTIVE
    - same type as the booking (a bus schedule uses its own bus)
    - seats are at least the passengers
    - no SCHEDULED or IN_PROGRESS trip overlaps the time window
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
        bkg = t.booking
        t_dist = (getattr(bkg, "estimated_distance_km", None) or getattr(bkg, "distance_km", None)) if bkg else None
        t_start, t_end = trip_time_window(t.scheduled_datetime, t_dist)
        if (t_start <= end_datetime) and (t_end >= start_datetime):
            time_str = t_end.strftime("%I:%M %p")
            return False, f"On a trip until {time_str}"

    return True, None


def is_driver_free(driver, start_datetime, end_datetime, driver_trips=None):
    """
    A driver is available when:
    - ACTIVE
    - licence valid until after the trip date
    - not ON_TRIP (no active IN_PROGRESS trip)
    - no overlapping scheduled trip
    Returns (is_available: bool, reason: str or None)
    """
    if driver.status != Driver.Status.ACTIVE:
        return False, f"Driver is not active (current status: {driver.status})"

    if driver.license_expiry < end_datetime.date():
        return False, f"Licence expires before the trip ({driver.license_expiry})"

    if driver_trips is not None:
        trips_list = driver_trips.get(driver.id, [])
        # Check if driver has any IN_PROGRESS trip
        if any(t.status == Trip.Status.IN_PROGRESS for t in trips_list):
            return False, "Driver is currently on a trip"
        overlapping_trips = trips_list
    else:
        if Trip.objects.filter(driver=driver, status=Trip.Status.IN_PROGRESS).exists():
            return False, "Driver is currently on a trip"
        overlapping_trips = Trip.objects.filter(
            driver=driver,
            status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS],
        )

    for t in overlapping_trips:
        bkg = t.booking
        t_dist = (getattr(bkg, "estimated_distance_km", None) or getattr(bkg, "distance_km", None)) if bkg else None
        t_start, t_end = trip_time_window(t.scheduled_datetime, t_dist)
        if (t_start <= end_datetime) and (t_end >= start_datetime):
            time_str = t_end.strftime("%I:%M %p")
            return False, f"On a trip until {time_str}"

    return True, None

