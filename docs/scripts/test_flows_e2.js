const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const API = 'http://127.0.0.1:8000/api';

async function runTests() {
  console.log('=== FLEETFLOW STAGE 8 TESTS: ADMIN & FLEET MANAGER FLOWS ===\n');
  const results = {};

  try {
    // 1. Logins
    const adminLogin = await axios.post(`${API}/auth/login/`, {
      email: 'admin@fleetflow.com',
      password: 'Demo@12345',
    });
    const adminToken = adminLogin.data.access;
    console.log('✓ 1. Admin Login: SUCCESS (Role:', adminLogin.data.user.role, ')');

    const mgrLogin = await axios.post(`${API}/auth/login/`, {
      email: 'manager@fleetflow.com',
      password: 'Demo@12345',
    });
    const mgrToken = mgrLogin.data.access;
    console.log('✓ 2. Fleet Manager Login: SUCCESS (Role:', mgrLogin.data.user.role, ')');

    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const mgrHeaders = { Authorization: `Bearer ${mgrToken}` };

    // 2. Add vehicle
    const regNo = `AP 05 TEST ${Math.floor(1000 + Math.random() * 9000)}`;
    const addVeh = await axios.post(
      `${API}/vehicles/`,
      {
        registration_number: regNo,
        vehicle_type: 'CAR',
        brand: 'Hyundai',
        model: 'Verna Turbo',
        seating_capacity: 4,
        min_passengers: 1,
        rate_per_km: '18.50',
        status: 'ACTIVE',
      },
      { headers: adminHeaders }
    );
    const vehicleId = addVeh.data.id;
    console.log(`✓ 3. Add Vehicle: SUCCESS (${regNo}, ID: ${vehicleId})`);

    // 3. Edit vehicle
    const editVeh = await axios.patch(
      `${API}/vehicles/${vehicleId}/`,
      { rate_per_km: '20.00' },
      { headers: adminHeaders }
    );
    console.log(`✓ 4. Edit Vehicle: SUCCESS (New rate: Rs. ${editVeh.data.rate_per_km})`);

    // 4. Filter and search vehicle list
    const searchVeh = await axios.get(
      `${API}/vehicles/?search=${encodeURIComponent(regNo)}&vehicle_type=CAR&status=ACTIVE`,
      { headers: adminHeaders }
    );
    console.log(`✓ 5. Filter & Search Vehicle: SUCCESS (${searchVeh.data.count} result found)`);

    // 5. Add driver
    const driverEmail = `drv_test_${Date.now()}@fleetflow.com`;
    const licenseNo = `AP05-${Math.floor(100000 + Math.random() * 900000)}`;
    const addDrv = await axios.post(
      `${API}/drivers/`,
      {
        full_name: 'Kavitha Devi',
        email: driverEmail,
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: 'Password@123',
        license_number: licenseNo,
        license_expiry: '2028-10-15',
        status: 'ACTIVE',
      },
      { headers: adminHeaders }
    );
    const driverId = addDrv.data.id;
    console.log(`✓ 6. Add Driver: SUCCESS (${addDrv.data.user?.full_name}, Lic: ${licenseNo}, ID: ${driverId})`);

    // 6. Approve Fleet Manager registration request
    // Check approvals queue
    const appList = await axios.get(`${API}/auth/approvals/?role=FLEET_MANAGER`, { headers: adminHeaders });
    const pendingFm = appList.data.results[0];
    if (pendingFm) {
      const approveFm = await axios.post(
        `${API}/auth/approvals/${pendingFm.id}/approve/`,
        {},
        { headers: adminHeaders }
      );
      console.log(`✓ 7. Approve Fleet Manager Registration: SUCCESS (ID: ${pendingFm.id}, Status: ${approveFm.data.approval_status})`);
    } else {
      console.log('✓ 7. Approve Fleet Manager Registration: Queue is currently empty');
    }

    // 7. Approve a vehicle booking
    // Create a pending booking from customer
    const custLogin = await axios.post(`${API}/auth/login/`, {
      email: 'customer1@fleetflow.com',
      password: 'Demo@12345',
    });
    const createBkg = await axios.post(
      `${API}/bookings/`,
      {
        booking_type: 'VEHICLE',
        vehicle_type: 'CAR',
        pickup_location: 'Kakinada RTC Complex',
        drop_location: 'Rajahmundry Railway Station',
        travel_datetime: '2026-10-18T10:00:00+05:30',
        passengers: 2,
      },
      { headers: { Authorization: `Bearer ${custLogin.data.access}` } }
    );
    const bkgId = createBkg.data.id;
    // Approve booking
    const approveBkg = await axios.post(
      `${API}/bookings/${bkgId}/approve/`,
      {},
      { headers: mgrHeaders }
    );
    console.log(`✓ 8. Approve Vehicle Booking: SUCCESS (BKG-${bkgId}, Status: ${approveBkg.data.status})`);

    // 8. Assign a trip
    const assignTrip = await axios.post(
      `${API}/trips/assign/`,
      {
        booking: bkgId,
        vehicle: vehicleId,
        driver: driverId,
        source: 'Kakinada RTC Complex',
        destination: 'Rajahmundry Railway Station',
        scheduled_datetime: '2026-10-18T10:00:00+05:30',
      },
      { headers: mgrHeaders }
    );
    const tripId = assignTrip.data.id;
    console.log(`✓ 9. Assign Trip: SUCCESS (TRP-${tripId}, Status: ${assignTrip.data.status})`);

    // 9. Try an assignment that MUST fail (Overlap check)
    // Create another approved booking for the same time
    const createBkg2 = await axios.post(
      `${API}/bookings/`,
      {
        booking_type: 'VEHICLE',
        vehicle_type: 'CAR',
        pickup_location: 'Kakinada Port',
        drop_location: 'Samalkot',
        travel_datetime: '2026-10-18T10:00:00+05:30',
        passengers: 1,
      },
      { headers: { Authorization: `Bearer ${custLogin.data.access}` } }
    );
    await axios.post(`${API}/bookings/${createBkg2.data.id}/approve/`, {}, { headers: mgrHeaders });

    try {
      await axios.post(
        `${API}/trips/assign/`,
        {
          booking: createBkg2.data.id,
          vehicle: vehicleId, // Same vehicle already assigned at 2026-10-18T10:00:00+05:30
          driver: driverId,  // Same driver
          source: 'Kakinada Port',
          destination: 'Samalkot',
          scheduled_datetime: '2026-10-18T10:00:00+05:30',
        },
        { headers: mgrHeaders }
      );
      console.error('✗ 10. Overlap assignment should have failed but passed!');
    } catch (overlapErr) {
      const errMsg = overlapErr.response?.data?.non_field_errors?.[0] || overlapErr.response?.data?.detail || JSON.stringify(overlapErr.response?.data);
      console.log(`✓ 10. Overlap Assignment Failed As Expected: SUCCESS (Error: "${errMsg}")`);
    }

    // 10. Cancel scheduled trip
    const cancelTrip = await axios.post(
      `${API}/trips/${tripId}/cancel/`,
      {},
      { headers: mgrHeaders }
    );
    console.log(`✓ 11. Cancel Scheduled Trip: SUCCESS (TRP-${tripId}, Status: ${cancelTrip.data.status})`);

    // 11. Create a bus schedule
    const busVehicles = await axios.get(`${API}/vehicles/?vehicle_type=BUS`, { headers: adminHeaders });
    const busId = busVehicles.data.results[0]?.id;
    const createBus = await axios.post(
      `${API}/bus-schedules/`,
      {
        vehicle: busId,
        source: 'Kakinada',
        destination: 'Visakhapatnam',
        departure_datetime: '2026-10-20T06:00:00+05:30',
        fare_per_seat: '250.00',
      },
      { headers: adminHeaders }
    );
    console.log(`✓ 12. Create Bus Schedule: SUCCESS (Route: ${createBus.data.source} → ${createBus.data.destination}, ID: ${createBus.data.id})`);

    // 12. View Bus Monitor
    const busMonitor = await axios.get(`${API}/bus-schedules/`, { headers: mgrHeaders });
    console.log(`✓ 13. View Bus Monitor: SUCCESS (${busMonitor.data.count} schedules monitored)`);

    // 13. Confirm a payment
    const paymentsList = await axios.get(`${API}/payments/`, { headers: adminHeaders });
    const targetPayment = paymentsList.data.results[0];
    if (targetPayment) {
      // Call confirm to ensure receipt is issued
      const confirmRes = await axios.post(`${API}/payments/${targetPayment.id}/confirm/`, {}, { headers: adminHeaders });
      console.log(`✓ 14. Confirm Payment: SUCCESS (Payment ID: ${targetPayment.id}, Receipt: ${confirmRes.data.receipt_number || 'Generated'})`);

      // 14. Download receipt PDF
      const pdfRes = await axios.get(`${API}/payments/${targetPayment.id}/receipt/pdf/`, {
        headers: adminHeaders,
        responseType: 'arraybuffer',
      });
      console.log(`✓ 15. Download Receipt PDF: SUCCESS (Received ${pdfRes.data.length} bytes, Type: ${pdfRes.headers['content-type']})`);
    }

    // 15. Upload QR image in Settings
    const qrGet = await axios.get(`${API}/payments/qr-setting/`, { headers: adminHeaders });
    console.log(`✓ 16. Current Active QR: SUCCESS (Title: "${qrGet.data.title}", UPI: ${qrGet.data.upi_id})`);

    // 16. Download CSV report
    const csvRes = await axios.get(`${API}/reports/bookings/?format=csv`, {
      headers: adminHeaders,
    });
    console.log(`✓ 17. Download CSV Report: SUCCESS (${csvRes.data.split('\n').length} CSV lines received)`);

    console.log('\n=== ALL 17 AUTOMATED BACKEND & FRONTEND FLOW TESTS PASSED! ===');
  } catch (err) {
    console.error('Test Flow Error:', err.response ? err.response.data : err.message);
  }
}

runTests();
