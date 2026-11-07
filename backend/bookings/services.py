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

        return {
            "processed": len(schedules),
            "confirmed": confirmed_count,
            "cancelled": cancelled_count,
        }
