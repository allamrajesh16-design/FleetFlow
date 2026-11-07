import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from payments.models import Payment
from bookings.models import Booking
from trips.models import Trip
from accounts.models import User

print("Payments count:", Payment.objects.count())
for p in Payment.objects.all():
    print(f"Payment #{p.id}: status={p.status}, amount={p.amount}, method={p.payment_method}, booking={p.booking_id}, trip={p.trip_id}")

print("\nRecent Bookings:")
for b in Booking.objects.order_by('-id')[:5]:
    print(f"Booking #{b.id}: status={b.status}, type={b.vehicle_type}, user={b.customer.email}, fare={b.estimated_fare}")
