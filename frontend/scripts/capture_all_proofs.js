const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const tempUserDir = path.join(os.tmpdir(), `puppeteer_proof_audit_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Helper login
  async function login(email, pwd = 'Demo@12345') {
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="identifier"], input[type="text"]', { timeout: 15000 });
    await page.type('input[name="identifier"], input[type="text"]', email);
    await page.type('input[name="password"], input[type="password"]', pwd);
    await page.click('button[type="submit"]');
    await sleep(2500);
  }

  // 1. ADMIN DASHBOARD & VEHICLES TABLE
  console.log('Capturing Admin views (1366px and 360px)...');
  await login('admin@fleetflow.com');

  // Admin Dashboard 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/admin/dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_admin_dashboard_1366.png') });

  // Admin Dashboard 360
  await page.setViewport({ width: 360, height: 780 });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_admin_dashboard_360.png') });

  // Admin Vehicles Table 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/admin/vehicles', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_admin_vehicles_table_1366.png') });

  // Admin Vehicles Modal Form 1366
  const addVehBtn = await page.$('button.btn-primary');
  if (addVehBtn) {
    await addVehBtn.click();
    await sleep(800);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_form_modal_1366.png') });
  }

  // 2. FLEET MANAGER DASHBOARD & ASSIGN TRIP
  console.log('Capturing Manager views (1366px and 360px)...');
  await login('manager@fleetflow.com');

  // Manager Dashboard 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/manager/dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_manager_dashboard_1366.png') });

  // Manager Dashboard 360
  await page.setViewport({ width: 360, height: 780 });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_manager_dashboard_360.png') });

  // Manager Assign Trip 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_assign_trip_1366.png') });

  // Manager Assign Trip 360
  await page.setViewport({ width: 360, height: 780 });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_assign_trip_360.png') });

  // 3. DRIVER DASHBOARD & FORMS
  console.log('Capturing Driver views (1366px and 360px)...');
  await login('driver1@fleetflow.com');

  // Driver Dashboard 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/driver/dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_driver_dashboard_1366.png') });

  // Driver Dashboard 360
  await page.setViewport({ width: 360, height: 780 });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_driver_dashboard_360.png') });

  // Driver Fuel Form 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/driver/fuel', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const logFuelBtn = await page.$('button.btn-primary');
  if (logFuelBtn) {
    await logFuelBtn.click();
    await sleep(800);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_driver_fuel_form_1366.png') });
  }

  // 4. CUSTOMER DASHBOARD & BOOKING FLOW
  console.log('Capturing Customer views (1366px and 360px)...');
  await login('customer1@fleetflow.com');

  // Customer Dashboard 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/customer/dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_customer_dashboard_1366.png') });

  // Customer Dashboard 360
  await page.setViewport({ width: 360, height: 780 });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_customer_dashboard_360.png') });

  // Customer Booking Flow 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/customer/book', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_customer_booking_flow_1366.png') });

  // Customer Booking Flow 360
  await page.setViewport({ width: 360, height: 780 });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'proof_customer_booking_flow_360.png') });

  await browser.close();
  console.log('All comprehensive visual proofs captured successfully.');
})();

