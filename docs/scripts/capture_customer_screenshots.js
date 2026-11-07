const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const API_BASE = 'http://127.0.0.1:8000/api';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function capture() {
  console.log('1. Authenticating as customer1@fleetflow.com via API...');
  const loginRes = await axios.post(`${API_BASE}/auth/login/`, {
    email: 'customer1@fleetflow.com',
    password: 'Demo@12345',
  });
  const token = loginRes.data.access || loginRes.data.tokens?.access;
  const refresh = loginRes.data.refresh || loginRes.data.tokens?.refresh;
  const user = loginRes.data.user;
  console.log('   ✓ Logged in:', user.email);

  // Retrieve active booking & payment ID
  const custApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${token}` } });
  const [bRes, pRes] = await Promise.all([
    custApi.get('/bookings/'),
    custApi.get('/payments/history/'),
  ]);
  const bList = bRes.data.results || bRes.data;
  const pList = pRes.data.results || pRes.data;
  const activeBooking = bList.find(b => b.status === 'IN_PROGRESS' || b.status === 'APPROVED' || b.status === 'COMPLETED') || bList[0];
  const activePayment = pList.find(p => p.status === 'PAID') || pList[0];
  const unpaidPayment = pList.find(p => p.status === 'UNPAID' || p.status === 'PAYMENT_INITIATED') || pList[0];

  const bookingId = activeBooking?.id || 15;
  const paidPaymentId = activePayment?.id || 5;
  const payId = unpaidPayment?.id || paidPaymentId;

  console.log('2. Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 850 });

  // Pre-seed localStorage with credentials
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t, r, u) => {
    localStorage.setItem('fleetflow_access_token', t);
    localStorage.setItem('fleetflow_refresh_token', r);
    localStorage.setItem('fleetflow_user', JSON.stringify(u));
  }, token, refresh, user);

  // 1. Customer Dashboard - Desktop
  console.log('3. Capturing Customer Dashboard (Desktop)...');
  await page.goto('http://localhost:3000/customer/dashboard', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_customer_dashboard_desktop.png'), fullPage: true });

  // Customer Dashboard - 360px mobile
  console.log('   Capturing Customer Dashboard (360px Mobile)...');
  await page.setViewport({ width: 360, height: 740, isMobile: true });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_customer_dashboard_360px.png'), fullPage: true });
  await page.setViewport({ width: 1280, height: 850 });

  // 2. Vehicle Selection
  console.log('4. Capturing Vehicle Selection (/customer/book)...');
  await page.goto('http://localhost:3000/customer/book', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_vehicle_selection.png'), fullPage: true });

  // 3. Booking Form (Car)
  console.log('5. Capturing Booking Form (/customer/book/vehicle?type=CAR)...');
  await page.goto('http://localhost:3000/customer/book/vehicle?type=CAR', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_booking_form.png'), fullPage: true });

  // 4. Bus Booking
  console.log('6. Capturing Bus Booking (/customer/book/bus)...');
  await page.goto('http://localhost:3000/customer/book/bus', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_bus_booking.png'), fullPage: true });

  // 5. My Bookings
  console.log('7. Capturing My Bookings (/customer/bookings)...');
  await page.goto('http://localhost:3000/customer/bookings', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_my_bookings.png'), fullPage: true });

  // 6. Booking Details
  console.log(`8. Capturing Booking Details for #${bookingId}...`);
  await page.goto(`http://localhost:3000/customer/bookings/${bookingId}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_booking_details.png'), fullPage: true });

  // 7. Live Tracking
  console.log(`9. Capturing Live Tracking for #${bookingId}...`);
  await page.goto(`http://localhost:3000/customer/bookings/${bookingId}/track`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_live_tracking.png'), fullPage: true });

  // 8. Payment Page
  console.log(`10. Capturing Payment Pay Page for #${payId}...`);
  await page.goto(`http://localhost:3000/customer/payments/${payId}/pay`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_payment_pay_page.png'), fullPage: true });

  // 9. Payment Receipt
  console.log(`11. Capturing Payment Receipt for #${paidPaymentId}...`);
  await page.goto(`http://localhost:3000/customer/payments/${paidPaymentId}/receipt`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_payment_receipt.png'), fullPage: true });

  // 10. Payment History
  console.log('12. Capturing Payment History (/customer/payments)...');
  await page.goto('http://localhost:3000/customer/payments', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_payment_history.png'), fullPage: true });

  await browser.close();
  console.log('\n=============================================================');
  console.log('🎉 ALL SCREENSHOTS CAPTURED AND STORED IN:', SCREENSHOT_DIR);
  console.log('=============================================================');
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
