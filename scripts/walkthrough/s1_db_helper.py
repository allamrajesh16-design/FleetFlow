import os, sys, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import User
from bookings.models import Booking
from trips.models import Trip
from payments.models import Payment, Receipt
from vehicles.models import Vehicle
from drivers.models import Driver
from notifications.models import Notification
from decimal import Decimal

cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'

if cmd == 'get_latest_otp':
    email = sys.argv[2]
    # Check User verification_code or Notification message
    u = User.objects.filter(email=email).first()
    code = getattr(u, 'verification_code', None) or getattr(u, 'otp', None)
    if not code:
        n = Notification.objects.filter(recipient=u, channel='EMAIL').order_by('-created_at').first()
        if n and n.message:
            import re
            m = re.search(r'\b\d{4,6}\b', n.message)
            if m: code = m.group(0)
    print(f"OTP_START:{code}:OTP_END")

elif cmd == 'get_driver_and_vehicle':
    v = Vehicle.objects.filter(vehicle_type='CAR', status='ACTIVE').first()
    d = Driver.objects.filter(status='ACTIVE', user__approval_status='APPROVED').first()
    res = {
        'vehicle_id': v.id if v else None,
        'vehicle_reg': v.registration_number if v else None,
        'driver_id': d.id if d else None,
        'driver_name': d.user.full_name if d else None
    }
    print("DV_START" + json.dumps(res) + "DV_END")

elif cmd == 'get_booking_state':
    bid = int(sys.argv[2])
    b = Booking.objects.filter(id=bid).first()
    if b:
        data = {
            'id': b.id,
            'status': b.status,
            'fare': float(b.estimated_fare) if b.estimated_fare else None,
            'customer': b.customer.email
        }
        print("BKG_START" + json.dumps(data) + "BKG_END")
    else:
        print("NO_BKG")

elif cmd == 'get_trip_state':
    bid = int(sys.argv[2])
    t = Trip.objects.filter(booking_id=bid).first()
    if t:
        data = {
            'id': t.id,
            'status': t.status,
            'start_odometer': t.start_odometer,
            'end_odometer': t.end_odometer,
            'vehicle': t.vehicle.registration_number,
            'driver': t.driver.user.full_name
        }
        print("TRIP_START" + json.dumps(data) + "TRIP_END")
    else:
        print("NO_TRIP")

elif cmd == 'get_payment_state':
    bid = int(sys.argv[2])
    p = Payment.objects.filter(booking_id=bid).first()
    if p:
        data = {
            'id': p.id,
            'status': p.status,
            'amount': float(p.amount) if p.amount else 0,
            'reference': p.transaction_reference,
            'receipt': p.receipt.receipt_number if hasattr(p, 'receipt') and p.receipt else None
        }
        print("PAY_START" + json.dumps(data) + "PAY_END")
    else:
        print("NO_PAY")
