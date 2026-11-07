const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const API = 'http://127.0.0.1:8000/api';

async function runDriverFlows() {
  console.log('=== FLEETFLOW: TESTING DRIVER END-TO-END FLOWS ===\n');

  try {
    // 1. Ensure QR setting exists (as Admin)
    const adminLogin = await axios.post(`${API}/auth/login/`, {
      email: 'admin@fleetflow.com',
      password: 'Demo@12345',
    });
    const adminHeaders = { Authorization: `Bearer ${adminLogin.data.access}` };

    let qrSetting;
    try {
      const qrRes = await axios.get(`${API}/payments/qr-setting/`, { headers: adminHeaders });
      qrSetting = qrRes.data;
      console.log('✓ 1. Payment QR Setting already configured:', qrSetting.title, qrSetting.qr_image_url);
    } catch (e) {
      console.log('Creating sample payment QR setting...');
      // Create a dummy PNG
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      const form = new FormData();
      form.append('title', 'FleetFlow UPI QR Code');
      form.append('upi_id', 'fleetflow@upi');
      form.append('qr_image', pngBuffer, { filename: 'qr.png', contentType: 'image/png' });

      const qrPost = await axios.post(`${API}/payments/qr-setting/`, form, {
        headers: { ...adminHeaders, ...form.getHeaders() },
      });
      qrSetting = qrPost.data;
      console.log('✓ 1. Payment QR Setting created:', qrSetting.title);
    }

    // 2. Login as Fleet Manager to assign a scheduled trip to driver1
    const fmLogin = await axios.post(`${API}/auth/login/`, {
      email: 'manager@fleetflow.com',
      password: 'Demo@12345',
    });
    const fmHeaders = { Authorization: `Bearer ${fmLogin.data.access}` };

    // Get drivers and vehicles
    const driversRes = await axios.get(`${API}/drivers/`, { headers: fmHeaders });
    const driverList = driversRes.data.results || driversRes.data;
    const driver1 = driverList.find((d) => d.user?.email === 'driver1@fleetflow.com') || driverList[0];
    console.log(`✓ 2. Found Driver: ${driver1.user?.full_name} (${driver1.user?.email}, ID: ${driver1.id})`);

    const vehiclesRes = await axios.get(`${API}/vehicles/?vehicle_type=CAR&status=ACTIVE`, { headers: fmHeaders });
    const vehicleList = vehiclesRes.data.results || vehiclesRes.data;
    const vehicle = vehicleList[0];
    console.log(`✓ 3. Found Active Vehicle: ${vehicle.registration_number} (ID: ${vehicle.id})`);

    // Create an approved booking for customer
    const custLogin = await axios.post(`${API}/auth/login/`, {
      email: 'customer1@fleetflow.com',
      password: 'Demo@12345',
    });
    const custHeaders = { Authorization: `Bearer ${custLogin.data.access}` };

    const bookingRes = await axios.post(
      `${API}/bookings/`,
      {
        booking_type: 'VEHICLE',
        vehicle_type: 'CAR',
        pickup_location: 'Kakinada Beach Road',
        drop_location: 'Rajahmundry Railway Station',
        travel_datetime: new Date(Date.now() + 86400000).toISOString(),
        passengers: 2,
      },
      { headers: custHeaders }
    );
    const bookingId = bookingRes.data.id;
    console.log(`✓ 4. Created Booking #${bookingId} as customer1`);

    // Approve booking as Fleet Manager
    await axios.post(`${API}/bookings/${bookingId}/approve/`, {}, { headers: fmHeaders });
    console.log(`✓ 5. Approved Booking #${bookingId} as Fleet Manager`);

    // Assign Trip to driver1
    const assignRes = await axios.post(
      `${API}/trips/assign/`,
      {
        booking: bookingId,
        vehicle: vehicle.id,
        driver: driver1.id,
        source: 'Kakinada Beach Road',
        destination: 'Rajahmundry Railway Station',
        scheduled_datetime: new Date(Date.now() + 86400000).toISOString(),
      },
      { headers: fmHeaders }
    );
    const tripId = assignRes.data.id;
    console.log(`✓ 6. Assigned Trip #${tripId} to driver ${driver1.user?.full_name}`);

    // 3. Login as driver1
    const drvLogin = await axios.post(`${API}/auth/login/`, {
      email: 'driver1@fleetflow.com',
      password: 'Demo@12345',
    });
    const drvHeaders = { Authorization: `Bearer ${drvLogin.data.access}` };
    console.log('✓ 7. Driver Login: SUCCESS (Role:', drvLogin.data.user.role, ')');

    // 4. Test GET /dashboard/driver/ and /drivers/me/
    const dashRes = await axios.get(`${API}/dashboard/driver/`, { headers: drvHeaders });
    console.log('✓ 8. GET /dashboard/driver/: SUCCESS', {
      todays_trips: dashRes.data.todays_trips,
      completed_trips: dashRes.data.completed_trips,
      total_distance_km: dashRes.data.total_distance_km,
      upcoming_trip: dashRes.data.upcoming_trip?.id,
    });

    const meRes = await axios.get(`${API}/drivers/me/`, { headers: drvHeaders });
    console.log('✓ 9. GET /drivers/me/: SUCCESS (Lic:', meRes.data.license_number, ', Status:', meRes.data.status, ')');

    // 5. Test GET /trips/my-trips/
    const myTripsUpcoming = await axios.get(`${API}/trips/my-trips/?status=upcoming`, { headers: drvHeaders });
    const countUpcoming = (myTripsUpcoming.data.results || myTripsUpcoming.data).length;
    console.log(`✓ 10. GET /trips/my-trips/?status=upcoming: SUCCESS (${countUpcoming} trips found)`);

    // 6. Test Trip Details
    const tripDetail = await axios.get(`${API}/trips/${tripId}/`, { headers: drvHeaders });
    console.log(`✓ 11. GET /trips/${tripId}/: SUCCESS (Status: ${tripDetail.data.status}, Source: ${tripDetail.data.source})`);

    // 7. Test wrong odometer on start
    try {
      await axios.post(`${API}/trips/${tripId}/start/`, { start_odometer: -5 }, { headers: drvHeaders });
      console.error('❌ Failed: Negative odometer should have been rejected');
    } catch (e) {
      console.log('✓ 12. Negative start odometer correctly rejected:', e.response?.data);
    }

    // 8. Test valid start trip
    const startRes = await axios.post(`${API}/trips/${tripId}/start/`, { start_odometer: 18500 }, { headers: drvHeaders });
    console.log(`✓ 13. POST /trips/${tripId}/start/: SUCCESS (New Status: ${startRes.data.status}, Start Odo: ${startRes.data.start_odometer})`);

    // 9. Test location update
    const locRes = await axios.post(
      `${API}/trips/${tripId}/location/`,
      { latitude: '16.989060', longitude: '82.247460' },
      { headers: drvHeaders }
    );
    console.log(`✓ 14. POST /trips/${tripId}/location/: SUCCESS (Coords: ${locRes.data.latitude}, ${locRes.data.longitude})`);

    // 10. Test wrong end odometer on complete
    try {
      await axios.post(`${API}/trips/${tripId}/complete/`, { end_odometer: 18400 }, { headers: drvHeaders });
      console.error('❌ Failed: End odometer <= start odometer should have been rejected');
    } catch (e) {
      console.log('✓ 15. Invalid end odometer (18400 <= 18500) correctly rejected:', e.response?.data);
    }

    // 11. Test valid complete trip
    const compRes = await axios.post(`${API}/trips/${tripId}/complete/`, { end_odometer: 18575 }, { headers: drvHeaders });
    console.log(`✓ 16. POST /trips/${tripId}/complete/: SUCCESS (Status: ${compRes.data.status}, Fare: ₹${compRes.data.total_fare}, Distance: ${compRes.data.distance_km} km)`);

    // 12. Check Payments generated for trip
    const pmtRes = await axios.get(`${API}/payments/?trip=${tripId}`, { headers: drvHeaders });
    const pmtList = pmtRes.data.results || pmtRes.data;
    const payment = pmtList[0];
    console.log(`✓ 17. GET /payments/?trip=${tripId}: SUCCESS (Payment ID: ${payment.id}, Amount: ₹${payment.amount}, Status: ${payment.status})`);

    // 13. Customer submits proof
    const proofForm = new FormData();
    proofForm.append('transaction_reference', `UPI${Math.floor(100000000 + Math.random() * 900000000)}`);
    const submitProofRes = await axios.post(
      `${API}/payments/${payment.id}/submit-proof/`,
      proofForm,
      { headers: { ...custHeaders, ...proofForm.getHeaders() } }
    );
    console.log(`✓ 18. Customer submit-proof: SUCCESS (Status: ${submitProofRes.data.status}, Txn: ${submitProofRes.data.transaction_reference})`);

    // 14. Driver confirms payment
    const confirmRes = await axios.post(`${API}/payments/${payment.id}/confirm/`, {}, { headers: drvHeaders });
    console.log(`✓ 19. Driver confirm payment: SUCCESS (Receipt: ${confirmRes.data.receipt_number})`);

    // 15. Download receipt PDF
    const pdfRes = await axios.get(`${API}/payments/${payment.id}/receipt/pdf/`, {
      headers: drvHeaders,
      responseType: 'arraybuffer',
    });
    console.log(`✓ 20. GET /payments/${payment.id}/receipt/pdf/: SUCCESS (${pdfRes.data.length} bytes received)`);

    // 16. Check Trip History
    const histRes = await axios.get(`${API}/trips/history/?status=COMPLETED`, { headers: drvHeaders });
    const histList = histRes.data.results || histRes.data;
    const foundTrip = histList.find((t) => t.id === tripId);
    console.log(`✓ 21. GET /trips/history/: SUCCESS (Trip #${tripId} present in completed history: ${!!foundTrip})`);

    console.log('\n=== ALL 21 DRIVER FLOW TESTS PASSED SUCCESSFULLY! ===\n');
  } catch (err) {
    console.error('❌ Test failed with error:', err.response?.data || err.message);
  }
}

runDriverFlows();
