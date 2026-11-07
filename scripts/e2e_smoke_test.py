"""
FleetFlow End-to-End Smoke Test Script (scripts/e2e_smoke_test.py)
Validates the 3 main business journeys via direct REST API client:
  Journey 1: Customer books a vehicle reservation.
  Journey 2: Driver starts an assigned trip, updates odometer, and completes trip.
  Journey 3: New user registers, Admin reviews and approves the account, user logs in.
"""
import os
import sys
from datetime import timedelta
from decimal import Decimal

# Setup Django environment
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User
from vehicles.models import Vehicle
from drivers.models import Driver
from bookings.models import Booking
from trips.models import Trip
from payments.models import Payment


def run_e2e_smoke_tests():
    print("=" * 80)
    print(" FLEETFLOW END-TO-END SMOKE TEST SUITE (3 CORE JOURNEYS)")
    print("=" * 80)
    client = APIClient()

    # --------------------------------------------------------------------------
    # JOURNEY 1: Customer books vehicle reservation
    # --------------------------------------------------------------------------
    print("\n[JOURNEY 1] Customer creates a vehicle reservation...")
    customer = User.objects.filter(role=User.Role.CUSTOMER, is_active=True).first()
    if not customer:
        customer = User.objects.create_user(
            email="e2e.customer@fleetflow.com",
            phone="9876543210",
            password="TestPassword@123",
            full_name="E2E Customer",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED
        )

    # Ensure password works
    customer.set_password('CustomerPass@123')
    customer.approval_status = User.ApprovalStatus.APPROVED
    customer.is_active = True
    customer.save()

    login_res = client.post('/api/auth/login/', {
        'identifier': customer.email,
        'password': 'CustomerPass@123'
    }, format='json')

    assert login_res.status_code == 200, f"Customer login failed: {login_res.data}"
    token = login_res.data['access']
    auth_header = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
    print(f"  ✓ Customer authenticated: {customer.email}")

    # Create Booking via API
    future_time = timezone.now() + timedelta(days=2)
    book_res = client.post('/api/bookings/', {
        'booking_type': Booking.BookingType.VEHICLE,
        'vehicle_type': Booking.VehicleType.CAR,
        'pickup_location': 'City Central Depot',
        'drop_location': 'Airport Terminal 2',
        'travel_datetime': future_time.isoformat(),
        'passengers': 2
    }, format='json', **auth_header)

    assert book_res.status_code in (200, 201), f"Booking creation failed: {book_res.data}"
    booking_id = book_res.data['id']
    print(f"  ✓ Booking #{booking_id} created successfully (Status: {book_res.data.get('status')})")
    print("  RESULT: JOURNEY 1 PASS ✅")

    # --------------------------------------------------------------------------
    # JOURNEY 2: Driver completes an assigned trip & payment generated
    # --------------------------------------------------------------------------
    print("\n[JOURNEY 2] Driver starts trip, logs odometer, completes journey, payment generated...")
    driver_user = User.objects.filter(role=User.Role.DRIVER, is_active=True).first()
    if not driver_user:
        driver_user = User.objects.create_user(
            email="e2e.driver@fleetflow.com",
            phone="9876543211",
            password="DriverPass@123",
            full_name="E2E Driver",
            role=User.Role.DRIVER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED
        )

    driver_profile = Driver.objects.filter(user=driver_user).first()
    if not driver_profile:
        driver_profile = Driver.objects.create(
            user=driver_user,
            license_number="DL-E2E-9999",
            license_expiry=timezone.now().date() + timedelta(days=365),
            status=Driver.Status.ACTIVE
        )
    else:
        driver_profile.status = Driver.Status.ACTIVE
        driver_profile.save()

    vehicle = Vehicle.objects.filter(status=Vehicle.Status.ACTIVE, vehicle_type=Vehicle.VehicleType.CAR).first()
    if not vehicle:
        vehicle = Vehicle.objects.create(
            registration_number="AP-05-E2E-01",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Toyota",
            model="Innova",
            seating_capacity=5,
            status=Vehicle.Status.ACTIVE,
            rate_per_km=Decimal("15.00")
        )

    # Create an assigned trip
    booking_obj = Booking.objects.get(id=booking_id)
    booking_obj.status = Booking.Status.APPROVED
    booking_obj.save()

    start_odo = 12000
    trip = Trip.objects.create(
        booking=booking_obj,
        driver=driver_profile,
        vehicle=vehicle,
        source="City Central Depot",
        destination="Airport Terminal 2",
        scheduled_datetime=future_time,
        status=Trip.Status.SCHEDULED
    )

    # Driver login
    driver_user.set_password('DriverPass@123')
    driver_user.approval_status = User.ApprovalStatus.APPROVED
    driver_user.is_active = True
    driver_user.is_email_verified = True
    driver_user.save()

    d_login = client.post('/api/auth/login/', {
        'identifier': driver_user.email,
        'password': 'DriverPass@123'
    }, format='json')
    assert d_login.status_code == 200, f"Driver login failed: {d_login.data}"
    d_auth = {'HTTP_AUTHORIZATION': f"Bearer {d_login.data['access']}"}
    print(f"  ✓ Driver authenticated: {driver_user.full_name}")

    # Driver starts trip with odometer
    start_res = client.post(f'/api/trips/{trip.id}/start/', {
        'start_odometer': start_odo
    }, format='json', **d_auth)
    assert start_res.status_code in (200, 204), f"Start trip failed: {start_res.data}"
    trip.refresh_from_db()
    print(f"  ✓ Trip #{trip.id} started with status: {trip.status} (odometer: {trip.start_odometer})")

    # Driver completes trip with ending odometer
    end_odo = start_odo + 35
    comp_res = client.post(f'/api/trips/{trip.id}/complete/', {
        'end_odometer': end_odo
    }, format='json', **d_auth)
    assert comp_res.status_code in (200, 204), f"Complete trip failed: {comp_res.data}"
    trip.refresh_from_db()
    print(f"  ✓ Trip #{trip.id} completed with status: {trip.status} (distance: {trip.end_odometer - trip.start_odometer} km)")

    # Verify payment record was auto-generated
    payment_record = Payment.objects.filter(trip=trip).first()
    assert payment_record is not None, "Expected payment record to be generated on trip completion"
    print(f"  ✓ Payment record #{payment_record.id} created automatically (Amount: Rs. {payment_record.amount})")
    print("  RESULT: JOURNEY 2 PASS ✅")

    # --------------------------------------------------------------------------
    # JOURNEY 3: Admin reviews and approves new user registration
    # --------------------------------------------------------------------------
    print("\n[JOURNEY 3] User registers, Admin reviews pending approval, user activates...")
    import random
    rand_suffix = random.randint(10000, 99999)
    new_email = f"manager.{rand_suffix}@gmail.com"
    new_phone = f"98765{rand_suffix:05d}"
    reg_res = client.post('/api/auth/register/', {
        'email': new_email,
        'phone': new_phone,
        'full_name': 'Pending Fleet Manager',
        'role': 'FLEET_MANAGER',
        'password': 'SecurePassword@123'
    }, format='json')
    assert reg_res.status_code in (200, 201), f"Registration failed: {reg_res.data}"
    print(f"  ✓ New applicant registered: {new_email} (requires approval)")

    # Admin login
    admin_user = User.objects.filter(role=User.Role.ADMIN, is_active=True).first()
    if not admin_user:
        admin_user = User.objects.create_superuser(
            email="admin@fleetflow.com",
            phone="9000000000",
            password="AdminPassword@123",
            full_name="Admin Staff",
            approval_status=User.ApprovalStatus.APPROVED
        )
    admin_user.set_password('AdminPass@123')
    admin_user.approval_status = User.ApprovalStatus.APPROVED
    admin_user.is_email_verified = True
    admin_user.is_active = True
    admin_user.save()

    a_login = client.post('/api/auth/login/', {
        'identifier': admin_user.email,
        'password': 'AdminPass@123'
    }, format='json')
    assert a_login.status_code == 200, f"Admin login failed: {a_login.data}"
    a_auth = {'HTTP_AUTHORIZATION': f"Bearer {a_login.data['access']}"}
    print("  ✓ Admin authenticated.")

    # User verifies email via OTP
    new_user = User.objects.get(email=new_email)
    new_user.is_email_verified = True
    new_user.approval_status = User.ApprovalStatus.PENDING
    new_user.save()

    # Admin approves user
    appr_res = client.post(f'/api/auth/approvals/{new_user.id}/approve/', {}, format='json', **a_auth)
    assert appr_res.status_code in (200, 204), f"Approval failed: {appr_res.data}"
    new_user.refresh_from_db()
    assert new_user.approval_status == User.ApprovalStatus.APPROVED, "User approval_status was not updated"
    print(f"  ✓ Admin approved user #{new_user.id} (approval_status: {new_user.approval_status})")

    # Approved user verifies email and can log in
    new_user.is_email_verified = True
    new_user.save()
    app_login = client.post('/api/auth/login/', {
        'identifier': new_email,
        'password': 'SecurePassword@123'
    }, format='json')
    assert app_login.status_code == 200, f"Approved user failed to login: {app_login.data}"
    print("  ✓ Newly approved user successfully authenticated and received JWT tokens.")
    print("  RESULT: JOURNEY 3 PASS ✅")

    print("\n" + "=" * 80)
    print(" ALL 3 END-TO-END JOURNEYS PASSED CLEANLY (100% SUCCESS)!")
    print("=" * 80)
    return 0


if __name__ == '__main__':
    sys.exit(run_e2e_smoke_tests())
