from datetime import timedelta
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from notifications.models import Notification, notify
from .models import BusSchedule, Booking


def check_bus_schedules():
    """
    Evaluates all OPEN bus schedules departing within the next 10 hours.
    - If booked_seats >= min_passengers: set schedule CONFIRMED and notify customers & managers.
    - If booked_seats < min_passengers: set schedule CANCELLED, cancel all bookings with
      refund_status REFUND_PENDING, and notify customers with options & managers.
    Safe to run repeatedly (idempotent, only targets status=OPEN).
    """
    now = timezone.now()
    threshold = now + timedelta(hours=10)

    with transaction.atomic():
        # Select and lock eligible OPEN schedules
        schedules = list(
            BusSchedule.objects.select_for_update().filter(
                status=BusSchedule.Status.OPEN,
                departure_datetime__lte=threshold,
            )
        )

        admin_and_managers = list(
            User.objects.filter(role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER])
        )

        confirmed_count = 0
        cancelled_count = 0

        for schedule in schedules:
            booked = schedule.booked_seats
            min_req = schedule.min_passengers

            if min_req is None:
                # Bus vehicle has no min_passengers configured; skip and alert staff
                for staff in admin_and_managers:
                    notify(
                        user=staff,
                        title="Bus Schedule Missing Minimum Passengers",
                        message=(
                            f"Bus schedule #{schedule.id} ({schedule.source} to {schedule.destination}) "
                            f"cannot be evaluated because assigned vehicle {schedule.vehicle.registration_number} "
                            f"has no minimum passengers configured."
                        ),
                        type=Notification.NotificationType.BOOKING,
                        item_type="bus_schedule",
                        item_id=schedule.id,
                    )
                continue

            if booked >= min_req:
                schedule.status = BusSchedule.Status.CONFIRMED
                schedule.save(update_fields=["status"])
                confirmed_count += 1

                # Notify all customers with active bookings on this schedule
                active_bookings = schedule.bookings.exclude(
                    status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
                ).select_related("customer")

                for booking in active_bookings:
                    notify(
                        user=booking.customer,
                        title="Bus Trip Confirmed",
                        message=f"Your bus trip is confirmed for route {schedule.source} to {schedule.destination}.",
                        type=Notification.NotificationType.BOOKING,
                        item_type="booking",
                        item_id=booking.id,
                    )

                # Notify Fleet Managers and Admins
                for staff in admin_and_managers:
                    notify(
                        user=staff,
                        title="Bus Schedule Confirmed",
                        message=(
                            f"Bus schedule #{schedule.id} ({schedule.source} to {schedule.destination}) "
                            f"is CONFIRMED with {booked}/{min_req} passengers."
                        ),
                        type=Notification.NotificationType.BOOKING,
                        item_type="bus_schedule",
                        item_id=schedule.id,
                    )

            else:
                schedule.status = BusSchedule.Status.CANCELLED
                schedule.save(update_fields=["status"])
                cancelled_count += 1

                # Cancel active bookings and set refund pending
                active_bookings = schedule.bookings.exclude(
                    status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
                ).select_related("customer")

                for booking in active_bookings:
                    booking.status = Booking.Status.CANCELLED
                    booking.refund_status = Booking.RefundStatus.REFUND_PENDING
                    booking.cancel_reason = "Cancelled by minimum passenger rule."
                    booking.save(update_fields=["status", "refund_status", "cancel_reason", "updated_at"])

                    notify(
                        user=booking.customer,
                        title="Bus Schedule Cancelled",
                        message=(
                            f"Your bus trip from {schedule.source} to {schedule.destination} has been cancelled "
                            f"because minimum passenger requirements were not met. You may choose one of three options: "
                            f"take an alternative vehicle, cancel, or get a refund."
                        ),
                        type=Notification.NotificationType.BOOKING,
                        item_type="booking",
                        item_id=booking.id,
                    )

                # Notify Fleet Managers and Admins
                for staff in admin_and_managers:
                    notify(
                        user=staff,
                        title="Bus Schedule Cancelled",
                        message=(
                            f"Bus schedule #{schedule.id} ({schedule.source} to {schedule.destination}) "
                            f"has been CANCELLED due to low passenger count ({booked}/{min_req})."
                        ),
                        type=Notification.NotificationType.BOOKING,
                        item_type="bus_schedule",
                        item_id=schedule.id,
                    )

        # Also sync any past schedules/trips whose departure datetime has already passed
        expired_stats = sync_expired_bus_schedules()

        return {
            "processed": len(schedules),
            "confirmed": confirmed_count,
            "cancelled": cancelled_count,
            "expired_schedules": expired_stats["expired_schedules"],
            "expired_trips": expired_stats["expired_trips"],
        }


def sync_expired_bus_schedules():
    """
    Checks all bus schedules and associated trips where departure/scheduled date has passed.
    - If departure_datetime <= now:
        - If status is OPEN:
            Mark schedule as EXPIRED.
        - If status is CONFIRMED:
            Check associated trips:
            - If any trip is IN_PROGRESS: leave as is (currently on the road).
            - If any trip is COMPLETED: mark schedule as COMPLETED.
            - If trip was SCHEDULED and departure has passed:
                Mark trip as EXPIRED.
                Mark schedule as EXPIRED.
            - If no trip was ever created and departure has passed:
                Mark schedule as EXPIRED.
    - All previous booking records, payment records, and customer histories are preserved.
    - Returns summary dict: {"expired_schedules": int, "expired_trips": int}.
    """
    now = timezone.now()
    from trips.models import Trip

    with transaction.atomic():
        expired_schedules_count = 0
        expired_trips_count = 0

        # 1. Any OPEN schedule whose departure_datetime <= now is EXPIRED
        expired_open_schedules = list(
            BusSchedule.objects.select_for_update().filter(
                status=BusSchedule.Status.OPEN,
                departure_datetime__lte=now,
            )
        )
        for s in expired_open_schedules:
            s.status = BusSchedule.Status.EXPIRED
            s.save(update_fields=["status"])
            expired_schedules_count += 1

        # 2. CONFIRMED schedules where departure_datetime <= now
        confirmed_past_schedules = list(
            BusSchedule.objects.select_for_update().filter(
                status=BusSchedule.Status.CONFIRMED,
                departure_datetime__lte=now,
            )
        )
        for s in confirmed_past_schedules:
            trips = list(s.trips.select_for_update().all())
            if not trips:
                s.status = BusSchedule.Status.EXPIRED
                s.save(update_fields=["status"])
                expired_schedules_count += 1
            else:
                has_in_progress = any(t.status == Trip.Status.IN_PROGRESS for t in trips)
                has_completed = any(t.status == Trip.Status.COMPLETED for t in trips)
                if has_in_progress:
                    continue
                elif has_completed:
                    s.status = BusSchedule.Status.COMPLETED
                    s.save(update_fields=["status"])
                else:
                    for t in trips:
                        if t.status == Trip.Status.SCHEDULED:
                            t.status = Trip.Status.EXPIRED
                            t.save(update_fields=["status"])
                            expired_trips_count += 1
                    s.status = BusSchedule.Status.EXPIRED
                    s.save(update_fields=["status"])
                    expired_schedules_count += 1

        return {
            "expired_schedules": expired_schedules_count,
            "expired_trips": expired_trips_count,
        }

