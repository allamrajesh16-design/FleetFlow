from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from bookings.models import Booking
from notifications.models import Notification, notify
from .models import Payment, Receipt


def create_trip_payments(trip):
    """
    Creates UNPAID payments for a completed trip.
    Idempotent: Does not create duplicate payments for the same booking.
    """
    created_payments = []

    if trip.booking:
        # Car or Bike trip
        if not Payment.objects.filter(booking=trip.booking).exists():
            fare = trip.total_fare or Decimal("0.00")
            payment = Payment.objects.create(
                booking=trip.booking,
                trip=trip,
                customer=trip.booking.customer,
                amount=fare,
                status=Payment.Status.UNPAID,
            )
            created_payments.append(payment)

            notify(
                user=trip.booking.customer,
                title="Payment Pending",
                message=f"Payment pending, Rs. {fare}",
                type=Notification.NotificationType.PAYMENT,
                item_type="payment",
                item_id=payment.id,
            )

    elif trip.bus_schedule:
        # Bus trip
        active_bookings = trip.bus_schedule.bookings.exclude(
            status__in=[Booking.Status.CANCELLED, Booking.Status.REJECTED]
        ).select_related("customer")

        for b in active_bookings:
            if not Payment.objects.filter(booking=b).exists():
                fare = b.final_fare or b.estimated_fare or Decimal("0.00")
                payment = Payment.objects.create(
                    booking=b,
                    trip=trip,
                    customer=b.customer,
                    amount=fare,
                    status=Payment.Status.UNPAID,
                )
                created_payments.append(payment)

                notify(
                    user=b.customer,
                    title="Payment Pending",
                    message=f"Payment pending, Rs. {fare}",
                    type=Notification.NotificationType.PAYMENT,
                    item_type="payment",
                    item_id=payment.id,
                )

    return created_payments


def create_payment_receipt(payment):
    """
    Creates an immutable Receipt record for a PAID payment.
    Idempotent: returns existing receipt if already present.
    """
    if hasattr(payment, "receipt") and payment.receipt:
        return payment.receipt

    receipt_num = Receipt.generate_receipt_number(payment.id)
    customer_name = (
        payment.customer.full_name
        if payment.customer
        else "Valued Customer"
    )

    data = {
        "receipt_number": receipt_num,
        "payment_id": payment.id,
        "customer_name": customer_name,
        "customer_email": payment.customer.email if payment.customer else "",
        "route": f"{payment.trip.source} to {payment.trip.destination}",
        "vehicle": f"{payment.trip.vehicle.registration_number} ({payment.trip.vehicle.brand} {payment.trip.vehicle.model})",
        "driver": f"{payment.trip.driver.user.full_name} ({payment.trip.driver.license_number})",
        "distance_km": payment.trip.distance_km,
        "amount": f"{payment.amount:.2f}",
        "payment_method": payment.payment_method or "ONLINE",
        "gateway_reference": payment.transaction_reference or payment.gateway_reference or "",
        "paid_at": payment.paid_at.isoformat() if payment.paid_at else timezone.now().isoformat(),
    }

    receipt, _ = Receipt.objects.get_or_create(
        payment=payment,
        defaults={
            "receipt_number": receipt_num,
            "data": data,
        },
    )
    return receipt
