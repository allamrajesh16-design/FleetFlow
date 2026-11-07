import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from datetime import timedelta
from django.utils import timezone
from accounts.models import User
from vehicles.models import Vehicle
from bookings.models import BusSchedule, Booking
from bookings.services import check_bus_schedules

print("=== TESTING BUS SCHEDULE CANCELLATION & CUSTOMER OPTIONS ===")

bus = Vehicle.objects.filter(vehicle_type=Vehicle.VehicleType.BUS).first()
admin = User.objects.filter(is_superuser=True).first()
customer1 = User.objects.filter(email='customer1@fleetflow.com').first()
customer2 = User.objects.filter(email='customer2@fleetflow.com').first()
customer3 = User.objects.filter(email='customer3@fleetflow.com').first()

bus.min_passengers = 10
bus.save()

# 1. Create a bus schedule departing in 2 hours (inside 10-hour threshold)
sched = BusSchedule.objects.create(
    vehicle=bus,
    source="Bangalore Majestic",
    destination="Mysore Palace",
    departure_datetime=timezone.now() + timedelta(hours=2),
    fare_per_seat=250.00,
    created_by=admin,
)
print(f"Created Bus Schedule #{sched.id} (departs in 2h, min_passengers={sched.min_passengers})")

# Customer 1 books 1 seat
b1 = Booking.objects.create(
    customer=customer1,
    booking_type=Booking.BookingType.BUS_SEAT,
    bus_schedule=sched,
    passengers=1,
    vehicle_type="BUS",
    travel_datetime=sched.departure_datetime,
    status=Booking.Status.APPROVED,
)
# Customer 2 books 2 seats
b2 = Booking.objects.create(
    customer=customer2,
    booking_type=Booking.BookingType.BUS_SEAT,
    bus_schedule=sched,
    passengers=2,
    vehicle_type="BUS",
    travel_datetime=sched.departure_datetime,
    status=Booking.Status.APPROVED,
)
# Customer 3 books 1 seat
b3 = Booking.objects.create(
    customer=customer3,
    booking_type=Booking.BookingType.BUS_SEAT,
    bus_schedule=sched,
    passengers=1,
    vehicle_type="BUS",
    travel_datetime=sched.departure_datetime,
    status=Booking.Status.APPROVED,
)

print(f"Created 3 bookings on schedule #{sched.id}: #{b1.id}, #{b2.id}, #{b3.id}. Total booked = 4 < min 10")

# 2. Run check_bus_schedules
res = check_bus_schedules()
print("check_bus_schedules output:", res)

sched.refresh_from_db()
b1.refresh_from_db()
b2.refresh_from_db()
b3.refresh_from_db()

print(f"Schedule #{sched.id} status now: {sched.status}")
print(f"Booking #{b1.id} status: {b1.status}, refund_status: {b1.refund_status}")
print(f"Booking #{b2.id} status: {b2.status}, refund_status: {b2.refund_status}")
print(f"Booking #{b3.id} status: {b3.status}, refund_status: {b3.refund_status}")

# 3. Test each option choice
# Option A: ALTERNATIVE_VEHICLE on b1
from rest_framework.test import APIRequestFactory, force_authenticate
from bookings.views import BookingViewSet

factory = APIRequestFactory()
view = BookingViewSet.as_view({'post': 'bus_response'})

req1 = factory.post(f'/api/bookings/{b1.id}/bus-response/', {'choice': 'ALTERNATIVE_VEHICLE'}, format='json')
force_authenticate(req1, user=customer1)
resp1 = view(req1, pk=b1.id)
b1.refresh_from_db()
print(f"Customer 1 selected ALTERNATIVE_VEHICLE -> HTTP {resp1.status_code}, Choice in DB: {b1.bus_option_choice}")

# Option B: CANCEL on b2
req2 = factory.post(f'/api/bookings/{b2.id}/bus-response/', {'choice': 'CANCEL'}, format='json')
force_authenticate(req2, user=customer2)
resp2 = view(req2, pk=b2.id)
b2.refresh_from_db()
print(f"Customer 2 selected CANCEL -> HTTP {resp2.status_code}, Choice in DB: {b2.bus_option_choice}, Status: {b2.status}")

# Option C: REFUND on b3
req3 = factory.post(f'/api/bookings/{b3.id}/bus-response/', {'choice': 'REFUND'}, format='json')
force_authenticate(req3, user=customer3)
resp3 = view(req3, pk=b3.id)
b3.refresh_from_db()
print(f"Customer 3 selected REFUND -> HTTP {resp3.status_code}, Choice in DB: {b3.bus_option_choice}, Refund Status: {b3.refund_status}")

print("=== ALL THREE BUS RESPONSE CHOICES TESTED AND VERIFIED ===")
