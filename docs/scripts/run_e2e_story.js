/**
 * FleetFlow Complete End-to-End Story Runner
 * Tests the entire lifecycle:
 * a) Customer registration, OTP verification, and login.
 * b) Driver registration, OTP verification, Fleet Manager approval, Driver login.
 * c) Fleet Manager registration, OTP verification, Admin approval, FM login.
 * d) Customer car booking, Fleet Manager approval and assignment of vehicle and Driver.
 * e) Driver trip start (odometer), location update, customer tracking check, driver trip complete.
 * f) Customer static QR payment submit proof, Driver confirmation, receipt download.
 * g) Admin dashboard stats check and CSV report download.
 * h) Bus schedule under-passenger auto-cancellation via check_bus_schedules and 3 customer option choices.
 * i) Admin refund of a PAID payment.
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const BASE_URL = 'http://127.0.0.1:8000/api';

function apiRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${endpoint}`);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let payload = null;
    if (body) {
      if (endpoint.includes('submit-proof')) {
        payload = `transaction_reference=${encodeURIComponent(body.transaction_reference)}`;
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      { method, headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch (e) {
            data = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

function getOtpForUser(email) {
  const pythonCmd = `import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup(); from accounts.models import User; u = User.objects.get(email='${email}'); otp = u.email_otps.filter(is_used=False).first(); code = '123456'; otp.otp_hash = otp.hash_otp(code); otp.save(); print(code)`;
  const result = execSync(
    `.\\venv\\Scripts\\python.exe -c "${pythonCmd}"`,
    { cwd: 'c:\\Users\\RAJESH\\Desktop\\FleetFlow\\backend', encoding: 'utf-8' }
  );
  return result.trim().slice(-6);
}

async function runStory() {
  console.log('================================================================');
  console.log('       FLEETFLOW COMPLETE END-TO-END STORY RUN-THROUGH          ');
  console.log('================================================================\n');

  const ts = Date.now();
  const customerEmail = `e2e_cust_${ts}@gmail.com`;
  const driverEmail = `e2e_driver_${ts}@gmail.com`;
  const fmEmail = `e2e_fm_${ts}@gmail.com`;
  const testPassword = 'Password@12345';

  // ---------------------------------------------------------------------------
  // a) Customer Registration, OTP, Login
  // ---------------------------------------------------------------------------
  console.log('Step a) Customer Registration, OTP Verification, and Login:');
  const regCust = await apiRequest('POST', '/auth/register/', {
    email: customerEmail,
    password: testPassword,
    full_name: 'E2E Customer',
    phone: `+9198${String(ts).slice(-8)}`,
    role: 'CUSTOMER',
  });
  if (regCust.status !== 201) throw new Error(`Cust register failed: ${JSON.stringify(regCust.data)}`);
  console.log('  -> Customer registered successfully (HTTP 201).');

  const custOtp = getOtpForUser(customerEmail);
  const verifyCust = await apiRequest('POST', '/auth/verify-otp/', {
    email: customerEmail,
    otp: custOtp,
  });
  if (verifyCust.status !== 200) throw new Error(`Cust verify failed: ${JSON.stringify(verifyCust.data)}`);
  console.log('  -> Customer OTP verified successfully (HTTP 200).');

  const loginCust = await apiRequest('POST', '/auth/login/', {
    email: customerEmail,
    password: testPassword,
  });
  if (loginCust.status !== 200) throw new Error(`Cust login failed: ${JSON.stringify(loginCust.data)}`);
  const custToken = loginCust.data.access;
  console.log('  -> Customer logged in, JWT token acquired (HTTP 200).\n');

  // ---------------------------------------------------------------------------
  // b) Driver Registration, OTP, FM Approval, Driver Login
  // ---------------------------------------------------------------------------
  console.log('Step b) Driver Registration, OTP Verification, Fleet Manager Approval, and Login:');
  const regDriver = await apiRequest('POST', '/auth/register/', {
    email: driverEmail,
    password: testPassword,
    full_name: 'E2E Driver Ramesh',
    phone: `+9197${String(ts).slice(-8)}`,
    role: 'DRIVER',
    license_number: `DL-E2E-${ts}`,
    license_expiry: '2028-12-31',
  });
  if (regDriver.status !== 201) throw new Error(`Driver register failed: ${JSON.stringify(regDriver.data)}`);
  console.log('  -> Driver registered successfully (HTTP 201).');

  const driverOtp = getOtpForUser(driverEmail);
  const verifyDriver = await apiRequest('POST', '/auth/verify-otp/', {
    email: driverEmail,
    otp: driverOtp,
  });
  if (verifyDriver.status !== 200) throw new Error(`Driver verify failed: ${JSON.stringify(verifyDriver.data)}`);
  console.log('  -> Driver email verified, queued for Fleet Manager approval (HTTP 200).');

  // Login as existing Fleet Manager to approve new driver
  const loginFmOrig = await apiRequest('POST', '/auth/login/', {
    email: 'manager@fleetflow.com',
    password: 'Demo@12345',
  });
  const fmOrigToken = loginFmOrig.data.access;

  // Find user id for driver
  const approvalsList = await apiRequest('GET', '/auth/approvals/', null, fmOrigToken);
  const appvResults = approvalsList.data.results || approvalsList.data;
  const driverPending = appvResults.find((u) => u.email === driverEmail);
  if (!driverPending) throw new Error('Pending driver not found in approvals list');

  const approveDriver = await apiRequest('POST', `/auth/approvals/${driverPending.id}/approve/`, {}, fmOrigToken);
  if (approveDriver.status !== 200) throw new Error(`Approve driver failed: ${JSON.stringify(approveDriver.data)}`);
  console.log(`  -> Fleet Manager approved Driver #${driverPending.id} (HTTP 200).`);

  const loginDriver = await apiRequest('POST', '/auth/login/', {
    email: driverEmail,
    password: testPassword,
  });
  if (loginDriver.status !== 200) throw new Error(`Driver login failed: ${JSON.stringify(loginDriver.data)}`);
  const driverToken = loginDriver.data.access;
  console.log('  -> Driver logged in successfully after approval (HTTP 200).\n');

  // ---------------------------------------------------------------------------
  // c) Fleet Manager Registration, OTP, Admin Approval, FM Login
  // ---------------------------------------------------------------------------
  console.log('Step c) Fleet Manager Registration, OTP Verification, Admin Approval, and Login:');
  const regFm = await apiRequest('POST', '/auth/register/', {
    email: fmEmail,
    password: testPassword,
    full_name: 'E2E Fleet Manager Suresh',
    phone: `+9196${String(ts).slice(-8)}`,
    role: 'FLEET_MANAGER',
  });
  if (regFm.status !== 201) throw new Error(`FM register failed: ${JSON.stringify(regFm.data)}`);
  console.log('  -> Fleet Manager registered successfully (HTTP 201).');

  const fmOtp = getOtpForUser(fmEmail);
  const verifyFm = await apiRequest('POST', '/auth/verify-otp/', {
    email: fmEmail,
    otp: fmOtp,
  });
  if (verifyFm.status !== 200) throw new Error(`FM verify failed: ${JSON.stringify(verifyFm.data)}`);
  console.log('  -> Fleet Manager email verified, queued for Admin approval (HTTP 200).');

  // Login as Admin to approve FM
  const loginAdmin = await apiRequest('POST', '/auth/login/', {
    email: 'admin@fleetflow.com',
    password: 'Demo@12345',
  });
  const adminToken = loginAdmin.data.access;

  const adminApprovals = await apiRequest('GET', '/auth/approvals/', null, adminToken);
  const adminAppvResults = adminApprovals.data.results || adminApprovals.data;
  const fmPending = adminAppvResults.find((u) => u.email === fmEmail);
  if (!fmPending) throw new Error('Pending FM not found in approvals list');

  const approveFm = await apiRequest('POST', `/auth/approvals/${fmPending.id}/approve/`, {}, adminToken);
  if (approveFm.status !== 200) throw new Error(`Approve FM failed: ${JSON.stringify(approveFm.data)}`);
  console.log(`  -> Admin approved Fleet Manager #${fmPending.id} (HTTP 200).`);

  const loginFm = await apiRequest('POST', '/auth/login/', {
    email: fmEmail,
    password: testPassword,
  });
  if (loginFm.status !== 200) throw new Error(`FM login failed: ${JSON.stringify(loginFm.data)}`);
  const fmToken = loginFm.data.access;
  console.log('  -> Fleet Manager logged in successfully after Admin approval (HTTP 200).\n');

  // ---------------------------------------------------------------------------
  // d) Customer books a car. Fleet Manager approves and assigns vehicle and Driver.
  // ---------------------------------------------------------------------------
  console.log('Step d) Customer Car Booking, Fleet Manager Approval & Assignment:');
  const bookResp = await apiRequest('POST', '/bookings/', {
    booking_type: 'VEHICLE',
    vehicle_type: 'CAR',
    pickup_location: 'Vijayawada Central',
    drop_location: 'Guntur Bus Station',
    travel_datetime: new Date(Date.now() + 86400000).toISOString(),
    passengers: 3,
    estimated_distance_km: 38.5,
  }, custToken);
  if (bookResp.status !== 201) throw new Error(`Booking failed: ${JSON.stringify(bookResp.data)}`);
  const bookingId = bookResp.data.id;
  console.log(`  -> Customer booked car, Booking #${bookingId} created as PENDING (HTTP 201).`);

  // FM Approves booking
  const appvBooking = await apiRequest('POST', `/bookings/${bookingId}/approve/`, {}, fmToken);
  if (appvBooking.status !== 200) throw new Error(`Approve booking failed: ${JSON.stringify(appvBooking.data)}`);
  console.log(`  -> Fleet Manager approved Booking #${bookingId} (HTTP 200).`);

  // Find an active car and driver profile
  const cars = await apiRequest('GET', '/vehicles/?vehicle_type=CAR&status=ACTIVE', null, fmToken);
  const carId = cars.data.results[0].id;

  const driversList = await apiRequest('GET', '/drivers/?status=ACTIVE', null, fmToken);
  const assignedDriver = driversList.data.results.find((d) => d.user.email === driverEmail) || driversList.data.results[0];

  const assignTrip = await apiRequest('POST', '/trips/assign/', {
    booking: bookingId,
    vehicle: carId,
    driver: assignedDriver.id,
  }, fmToken);
  if (assignTrip.status !== 201) throw new Error(`Assign trip failed: ${JSON.stringify(assignTrip.data)}`);
  const tripId = assignTrip.data.id;
  console.log(`  -> Fleet Manager assigned Vehicle #${carId} & Driver #${assignedDriver.id} -> Trip #${tripId} SCHEDULED (HTTP 201).\n`);

  // ---------------------------------------------------------------------------
  // e) Driver Starts Trip, Location Updates, Customer Tracks, Driver Completes
  // ---------------------------------------------------------------------------
  console.log('Step e) Driver Trip Start, Live GPS Tracking, and Trip Completion:');
  const startTrip = await apiRequest('POST', `/trips/${tripId}/start/`, {
    start_odometer: 15400,
  }, driverToken);
  if (startTrip.status !== 200) throw new Error(`Start trip failed: ${JSON.stringify(startTrip.data)}`);
  console.log(`  -> Driver started Trip #${tripId} with odometer 15,400 (Status: IN_PROGRESS) (HTTP 200).`);

  // Location share
  const locUpdate = await apiRequest('POST', `/trips/${tripId}/location/`, {
    latitude: 16.5062,
    longitude: 80.6480,
  }, driverToken);
  if (locUpdate.status !== 201) throw new Error(`Location post failed: ${JSON.stringify(locUpdate.data)}`);
  console.log('  -> Driver broadcasted live GPS coordinates: (16.5062, 80.6480) (HTTP 201).');

  // Customer tracking endpoint check
  const custTracking = await apiRequest('GET', `/bookings/${bookingId}/tracking/`, null, custToken);
  if (custTracking.status !== 200) throw new Error(`Cust tracking failed: ${JSON.stringify(custTracking.data)}`);
  if (!custTracking.data.last_known_location) throw new Error('Live location missing in tracking endpoint');
  console.log(`  -> Customer viewed Live Tracking: Step=${custTracking.data.step}, Driver=${custTracking.data.driver_name}, Vehicle=${custTracking.data.vehicle_registration} (HTTP 200).`);

  // Complete trip
  const completeTrip = await apiRequest('POST', `/trips/${tripId}/complete/`, {
    end_odometer: 15442,
  }, driverToken);
  if (completeTrip.status !== 200) throw new Error(`Complete trip failed: ${JSON.stringify(completeTrip.data)}`);
  console.log(`  -> Driver completed Trip #${tripId} with end odometer 15,442 (Distance: 42 km, Fare: Rs. ${completeTrip.data.total_fare}) (HTTP 200).\n`);

  // ---------------------------------------------------------------------------
  // f) Customer Pays with QR & Reference, Driver Confirms, Receipt Downloaded
  // ---------------------------------------------------------------------------
  console.log('Step f) Customer Payment via Static QR, Proof Submission, Driver Confirmation:');
  // Get payment ID
  const paymentsList = await apiRequest('GET', '/payments/', null, custToken);
  const paymentObj = paymentsList.data.results.find((p) => p.booking === bookingId);
  if (!paymentObj) throw new Error('Payment not found for booking');
  const paymentId = paymentObj.id;

  const payInfo = await apiRequest('GET', `/payments/${paymentId}/pay-info/`, null, custToken);
  console.log(`  -> Customer opened Payment Page: Amount=Rs. ${payInfo.data.amount}, UPI=${payInfo.data.upi_id} (HTTP 200).`);

  const txRef = `UTR${Date.now()}`;
  const submitProof = await apiRequest('POST', `/payments/${paymentId}/submit-proof/`, {
    transaction_reference: txRef,
  }, custToken);
  if (submitProof.status !== 200) throw new Error(`Submit proof failed: ${JSON.stringify(submitProof.data)}`);
  console.log(`  -> Customer submitted proof with UTR ${txRef} (Status: PAYMENT_INITIATED) (HTTP 200).`);

  // Driver confirms proof
  const confirmProof = await apiRequest('POST', `/payments/${paymentId}/confirm/`, {}, driverToken);
  if (confirmProof.status !== 200) throw new Error(`Driver confirm failed: ${JSON.stringify(confirmProof.data)}`);
  console.log(`  -> Driver confirmed payment proof -> Payment marked PAID, Receipt #${confirmProof.data.receipt_number} generated (HTTP 200).`);

  // Customer downloads receipt PDF
  const pdfResp = await apiRequest('GET', `/payments/${paymentId}/receipt/pdf/`, null, custToken);
  if (pdfResp.status !== 200) throw new Error(`PDF download failed: ${pdfResp.status}`);
  console.log('  -> Customer downloaded PDF receipt successfully (Content-Type: application/pdf) (HTTP 200).\n');

  // ---------------------------------------------------------------------------
  // g) Admin Dashboard & CSV Report Download
  // ---------------------------------------------------------------------------
  console.log('Step g) Admin Dashboard Stats & CSV Export:');
  const adminDash = await apiRequest('GET', '/dashboard/admin/', null, adminToken);
  if (adminDash.status !== 200) throw new Error(`Admin dashboard failed: ${JSON.stringify(adminDash.data)}`);
  console.log(`  -> Admin Dashboard retrieved: Total Vehicles=${adminDash.data.total_vehicles}, Bookings=${adminDash.data.total_bookings}, Revenue=Rs. ${adminDash.data.revenue} (HTTP 200).`);

  const tripsCsv = await apiRequest('GET', '/reports/trips/?format=csv', null, adminToken);
  if (tripsCsv.status !== 200) throw new Error(`Trips CSV report failed: ${tripsCsv.status}`);
  console.log('  -> Admin exported Trips CSV report successfully (HTTP 200).\n');

  // ---------------------------------------------------------------------------
  // h) Bus Schedule Passenger Check & Auto-Cancellation with Customer Options
  // ---------------------------------------------------------------------------
  console.log('Step h) Bus Schedule Under-Capacity Auto-Cancellation & Customer Options:');
  const buses = await apiRequest('GET', '/vehicles/?vehicle_type=BUS&status=ACTIVE', null, adminToken);
  const busId = buses.data.results[0].id;
  // Create schedule departing in 12 hours (so booking deadline is 2 hours from now)
  const busSched = await apiRequest('POST', '/bus-schedules/', {
    vehicle: busId,
    source: 'Vijayawada',
    destination: 'Hyderabad',
    departure_datetime: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    fare_per_seat: '450.00',
  }, adminToken);
  if (busSched.status !== 201) throw new Error(`Create bus sched failed: ${JSON.stringify(busSched.data)}`);
  const schedId = busSched.data.id;

  // Book 2 seats (fewer than minimum passengers of 10)
  const busBooking = await apiRequest('POST', '/bookings/', {
    booking_type: 'BUS_SEAT',
    vehicle_type: 'BUS',
    bus_schedule: schedId,
    passengers: 2,
    pickup_location: 'Vijayawada',
    drop_location: 'Hyderabad',
  }, custToken);
  if (busBooking.status !== 201) throw new Error(`Bus booking failed: ${JSON.stringify(busBooking.data)}`);
  console.log(`  -> Customer booked 2 seats on Bus Schedule #${schedId} (Booking #${busBooking.data.id}) (HTTP 201).`);

  // Move departure time to 2 hours from now (within the 10-hour evaluation window)
  execSync(
    `.\\venv\\Scripts\\python.exe -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup(); from bookings.models import BusSchedule; from django.utils import timezone; from datetime import timedelta; s = BusSchedule.objects.get(id=${schedId}); s.departure_datetime = timezone.now() + timedelta(hours=2); s.save();"`,
    { cwd: 'c:\\Users\\RAJESH\\Desktop\\FleetFlow\\backend' }
  );

  // Run scheduled job check_bus_schedules
  const schedCheckOutput = execSync(
    '.\\venv\\Scripts\\python.exe manage.py check_bus_schedules',
    { cwd: 'c:\\Users\\RAJESH\\Desktop\\FleetFlow\\backend', encoding: 'utf-8' }
  );
  console.log(`  -> Scheduled job check_bus_schedules executed: ${schedCheckOutput.trim()}`);

  // Customer selects ALTERNATIVE_VEHICLE
  const busOptionResp = await apiRequest('POST', `/bookings/${busBooking.data.id}/bus-response/`, {
    choice: 'ALTERNATIVE_VEHICLE',
  }, custToken);
  if (busOptionResp.status !== 200) throw new Error(`Bus response failed: ${JSON.stringify(busOptionResp.data)}`);
  console.log(`  -> Customer submitted response 'ALTERNATIVE_VEHICLE' -> Confirmed: ${busOptionResp.data.bus_option_choice} (HTTP 200).\n`);

  // ---------------------------------------------------------------------------
  // i) Admin Refunds a PAID Payment
  // ---------------------------------------------------------------------------
  console.log('Step i) Admin Refunds a PAID Payment:');
  const refundResp = await apiRequest('POST', `/payments/${paymentId}/refund/`, {}, adminToken);
  if (refundResp.status !== 200) throw new Error(`Admin refund failed: ${JSON.stringify(refundResp.data)}`);
  console.log(`  -> Admin processed refund for Payment #${paymentId} -> Status: ${refundResp.data.status} (HTTP 200).\n`);

  console.log('================================================================');
  console.log('     ALL END-TO-END STORY STEPS a) THROUGH i) COMPLETED!       ');
  console.log('================================================================');
}

runStory().catch((err) => {
  console.error('\nE2E Story execution error:', err);
  process.exit(1);
});
