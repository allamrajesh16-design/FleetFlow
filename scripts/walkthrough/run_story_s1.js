const puppeteer = require('../../frontend/node_modules/puppeteer-core');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const S1_DIR = path.resolve(__dirname, '../../docs/guide/images/s1');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function apiCall(method, urlPath, token, data) {
  return new Promise((resolve, reject) => {
    const postData = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8000,
      path: urlPath,
      method: method,
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, text: body }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: path.join(os.tmpdir(), 'chrome_story_s1_' + Date.now()),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const steps = [];

  // --- Step 1: Customer Login ---
  const custContext = await browser.createBrowserContext();
  const custPage = await custContext.newPage();
  await custPage.setViewport({ width: 1280, height: 800 });

  await custPage.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await custPage.type('#login-identifier-input, input[name="identifier"], input[type="text"]', 'wt.demo.s1.cust@gmail.com');
  await custPage.type('#login-password-input, input[name="password"], input[type="password"]', process.env.WT_PASSWORD || 'Walkthrough@123');
  await custPage.click('button[type="submit"]');
  await sleep(2500);

  const s1Screen1 = path.join(S1_DIR, 's1_01_cust_login.png');
  await custPage.screenshot({ path: s1Screen1 });
  steps.push({ step: 'S1.1', desc: 'Customer Login', screen: s1Screen1 });

  // --- Step 2: Customer Books a Car with Distance ---
  await custPage.goto('http://localhost:3000/customer/book/vehicle?type=CAR', { waitUntil: 'networkidle0' });
  await sleep(1500);

  await custPage.type('#pickup-input, input[name="pickup_location"]', 'Kakinada Main Road');
  await custPage.type('#drop-input, input[name="drop_location"]', 'Rajahmundry Airport');
  
  // Set date to 2 days ahead
  const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const futureStr = future.toISOString().slice(0, 16);
  await custPage.evaluate((fDate) => {
    const dInput = document.querySelector('input[type="datetime-local"]');
    if (dInput) {
      dInput.value = fDate;
      dInput.dispatchEvent(new Event('input', { bubbles: true }));
      dInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, futureStr);

  await custPage.type('#distance-input, input[name="estimated_distance_km"]', '65');
  await sleep(1000);

  const s1Screen2 = path.join(S1_DIR, 's1_02_cust_book_form.png');
  await custPage.screenshot({ path: s1Screen2 });
  steps.push({ step: 'S1.2', desc: 'Customer Book Form with Distance', screen: s1Screen2 });

  await custPage.click('button[type="submit"]');
  await sleep(2500);

  const s1Screen3 = path.join(S1_DIR, 's1_03_booking_submitted.png');
  await custPage.screenshot({ path: s1Screen3 });
  steps.push({ step: 'S1.3', desc: 'Booking Submitted Pending Approval', screen: s1Screen3 });

  // Get created booking ID from URL
  const bookingUrl = custPage.url();
  const bookingIdMatch = bookingUrl.match(/\/customer\/bookings\/(\d+)/);
  const bookingId = bookingIdMatch ? bookingIdMatch[1] : null;
  console.log('Story S1 Booking ID created:', bookingId);

  // --- Step 3: Fleet Manager Approves Booking ---
  const fmContext = await browser.createBrowserContext();
  const fmPage = await fmContext.newPage();
  await fmPage.setViewport({ width: 1280, height: 800 });

  await fmPage.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await fmPage.type('#login-identifier-input, input[name="identifier"], input[type="text"]', 'wt.manager+1@gmail.com');
  await fmPage.type('#login-password-input, input[name="password"], input[type="password"]', process.env.WT_PASSWORD || 'Walkthrough@123');
  await fmPage.click('button[type="submit"]');
  await sleep(2500);

  const fmToken = await fmPage.evaluate(() => localStorage.getItem('fleetflow_access_token') || sessionStorage.getItem('fleetflow_access_token'));

  // Approve booking via API or UI
  const approveRes = await apiCall('POST', `/api/bookings/${bookingId}/approve/`, fmToken, {});
  console.log('FM approve booking status:', approveRes.status);

  await fmPage.goto('http://localhost:3000/manager/trips', { waitUntil: 'networkidle0' });
  await sleep(1500);
  const s1Screen4 = path.join(S1_DIR, 's1_04_manager_approved.png');
  await fmPage.screenshot({ path: s1Screen4 });
  steps.push({ step: 'S1.4', desc: 'Manager Approves Booking', screen: s1Screen4 });

  // --- Step 4: Fleet Manager Assigns Vehicle and Driver ---
  // Query active car and active driver
  const vehRes = await apiCall('GET', '/api/vehicles/?vehicle_type=CAR&status=ACTIVE', fmToken);
  const carId = (vehRes.data?.results || vehRes.data || [])[0]?.id;
  const drvRes = await apiCall('GET', '/api/drivers/?status=ACTIVE', fmToken);
  const drvId = (drvRes.data?.results || drvRes.data || [])[0]?.id;

  const assignRes = await apiCall('POST', '/api/trips/assign/', fmToken, {
    booking: bookingId,
    vehicle: carId,
    driver: drvId,
    source: 'Kakinada Main Road',
    destination: 'Rajahmundry Airport',
    scheduled_datetime: future.toISOString()
  });
  console.log('Assign trip status:', assignRes.status, 'Trip ID:', assignRes.data?.id);
  const tripId = assignRes.data?.id;

  const s1Screen5 = path.join(S1_DIR, 's1_05_trip_assigned.png');
  await fmPage.screenshot({ path: s1Screen5 });
  steps.push({ step: 'S1.5', desc: 'Trip Assigned to Vehicle and Driver', screen: s1Screen5 });

  // --- Step 5: Driver Starts Trip with Odometer & Coordinates ---
  // Driver login
  const drvContext = await browser.createBrowserContext();
  const drvPage = await drvContext.newPage();
  await drvPage.setViewport({ width: 1280, height: 800 });

  await drvPage.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await drvPage.type('#login-identifier-input, input[name="identifier"], input[type="text"]', 'wt.driver+1@gmail.com');
  await drvPage.type('#login-password-input, input[name="password"], input[type="password"]', process.env.WT_PASSWORD || 'Walkthrough@123');
  await drvPage.click('button[type="submit"]');
  await sleep(2500);

  const drvToken = await drvPage.evaluate(() => localStorage.getItem('fleetflow_access_token') || sessionStorage.getItem('fleetflow_access_token'));

  // Driver starts trip
  const startRes = await apiCall('POST', `/api/trips/${tripId}/start/`, drvToken, { start_odometer: 10000 });
  console.log('Driver start trip status:', startRes.status);

  // Send geolocation update
  const locRes = await apiCall('POST', `/api/trips/${tripId}/location/`, drvToken, {
    latitude: 16.989060,
    longitude: 82.247460
  });
  console.log('Driver send location status:', locRes.status);

  await drvPage.goto('http://localhost:3000/driver/trips', { waitUntil: 'networkidle0' });
  await sleep(1500);
  const s1Screen6 = path.join(S1_DIR, 's1_06_driver_started_trip.png');
  await drvPage.screenshot({ path: s1Screen6 });
  steps.push({ step: 'S1.6', desc: 'Driver Starts Trip (IN_PROGRESS)', screen: s1Screen6 });

  // --- Step 6: Customer Live Tracking ---
  await custPage.goto(`http://localhost:3000/customer/tracking/${bookingId}`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  const s1Screen7 = path.join(S1_DIR, 's1_07_customer_live_tracking.png');
  await custPage.screenshot({ path: s1Screen7 });
  steps.push({ step: 'S1.7', desc: 'Customer Live Tracking Map & Marker', screen: s1Screen7 });

  // --- Step 7: Driver Completes Trip with Final Odometer ---
  const compRes = await apiCall('POST', `/api/trips/${tripId}/complete/`, drvToken, { end_odometer: 10065 });
  console.log('Driver complete trip status:', compRes.status, 'Total fare:', compRes.data?.total_fare);

  const s1Screen8 = path.join(S1_DIR, 's1_08_driver_completed_trip.png');
  await drvPage.screenshot({ path: s1Screen8 });
  steps.push({ step: 'S1.8', desc: 'Driver Completes Trip (COMPLETED)', screen: s1Screen8 });

  // --- Step 8: Customer Pays with QR, UTR & Proof Upload ---
  // Query created payment ID for booking
  const custBkgRes = await apiCall('GET', `/api/bookings/${bookingId}/`, await custPage.evaluate(() => localStorage.getItem('fleetflow_access_token')));
  const paymentId = custBkgRes.data?.payment_id;
  console.log('Payment ID generated:', paymentId);

  await custPage.goto(`http://localhost:3000/customer/payments/${paymentId}/pay`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const s1Screen9 = path.join(S1_DIR, 's1_09_customer_pay_qr.png');
  await custPage.screenshot({ path: s1Screen9 });
  steps.push({ step: 'S1.9', desc: 'Customer Pay QR Page', screen: s1Screen9 });

  // Submit proof via API
  const payToken = await custPage.evaluate(() => localStorage.getItem('fleetflow_access_token'));
  // Confirm payment via Driver or Admin
  const adminLogin = await apiCall('POST', '/api/auth/login/', null, {
    identifier: 'wt.admin+1@gmail.com',
    password: process.env.WT_PASSWORD || 'Walkthrough@123'
  });
  const adminToken = adminLogin.data?.access;
  const confRes = await apiCall('POST', `/api/payments/${paymentId}/confirm/`, adminToken, {});
  console.log('Admin confirm payment status:', confRes.status);

  // --- Step 9: Customer Receipt & PDF ---
  await custPage.goto(`http://localhost:3000/customer/payments/${paymentId}/receipt`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const s1Screen10 = path.join(S1_DIR, 's1_10_customer_receipt.png');
  await custPage.screenshot({ path: s1Screen10 });
  steps.push({ step: 'S1.10', desc: 'Customer Confirmed Receipt View', screen: s1Screen10 });

  console.log('STORY_S1_STEPS:', JSON.stringify(steps, null, 2));

  await browser.close();
})();

