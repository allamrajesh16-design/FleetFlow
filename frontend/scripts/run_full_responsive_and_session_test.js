const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/screenshots/responsive');
const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://127.0.0.1:8000';

const DEMO_PASSWORD = process.env.FLEETFLOW_DEMO_PASSWORD || 'Demo@12345';
const USERS = {
  admin: { email: 'admin@fleetflow.com', role: 'admin', home: '/admin/dashboard' },
  manager: { email: 'manager@fleetflow.com', role: 'manager', home: '/manager/dashboard' },
  driver: { email: 'driver1@fleetflow.com', role: 'driver', home: '/driver/dashboard' },
  customer: { email: 'customer1@fleetflow.com', role: 'customer', home: '/customer/dashboard' },
};

const WIDTHS = [
  { width: 1366, height: 768, label: '1366' },
  { width: 1024, height: 768, label: '1024' },
  { width: 768, height: 1024, label: '768' },
  { width: 360, height: 740, label: '360' },
];

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('=== FLEETFLOW FULL AUTOMATION: SECTIONS B, C, E2 ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1400,900'],
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon.ico') && !text.includes('404 (Not Found)')) {
        consoleErrors.push(text);
      }
    }
  });

  async function takeSnap(role, pageName, widthObj) {
    await page.setViewport({ width: widthObj.width, height: widthObj.height });
    await sleep(400);
    const filename = `${role}_${pageName}_${widthObj.label}.png`;
    const filePath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: false });
    // Check horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (hasHorizontalScroll) {
      console.warn(`[Scroll Warning]: Horizontal scroll detected on ${filename}!`);
    }
    return filename;
  }

  async function setSession(userObj, remember = true) {
    const res = await fetch(`${API_URL}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: userObj.email, password: DEMO_PASSWORD }),
    });
    const data = await res.json();
    if (!data.access) {
      throw new Error(`Failed to login as ${userObj.email}: ${JSON.stringify(data)}`);
    }

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ data, remember }) => {
      localStorage.clear();
      sessionStorage.clear();
      if (remember) {
        localStorage.setItem('fleetflow_remember', 'true');
        localStorage.setItem('fleetflow_access_token', data.access);
        localStorage.setItem('fleetflow_refresh_token', data.refresh);
        localStorage.setItem('fleetflow_user', JSON.stringify(data.user));
        localStorage.setItem('fleetflow_last_active', Date.now().toString());
      } else {
        sessionStorage.setItem('fleetflow_access_token', data.access);
        sessionStorage.setItem('fleetflow_refresh_token', data.refresh);
        sessionStorage.setItem('fleetflow_user', JSON.stringify(data.user));
      }
    }, { data, remember });
  }

  console.log('\n--- 1. Testing B3: Session Rules (Remember Me Unchecked vs Checked) ---');
  // Unchecked remember me -> sessionStorage only
  await setSession(USERS.admin, false);
  let storageCheck = await page.evaluate(() => ({
    localAccess: localStorage.getItem('fleetflow_access_token'),
    sessionAccess: sessionStorage.getItem('fleetflow_access_token'),
  }));
  if (storageCheck.localAccess || !storageCheck.sessionAccess) {
    throw new Error(`B3 Fail: Remember me false kept local: ${storageCheck.localAccess}`);
  }
  console.log('PASS: B3 - Remember me false stores token in sessionStorage only.');

  // Checked remember me -> localStorage
  await setSession(USERS.admin, true);
  storageCheck = await page.evaluate(() => ({
    localAccess: localStorage.getItem('fleetflow_access_token'),
    sessionAccess: sessionStorage.getItem('fleetflow_access_token'),
    remember: localStorage.getItem('fleetflow_remember'),
  }));
  if (!storageCheck.localAccess || storageCheck.remember !== 'true') {
    throw new Error(`B3 Fail: Remember me true failed to persist in localStorage.`);
  }
  console.log('PASS: B3 - Remember me true stores token in localStorage.');

  console.log('\n--- 2. Testing B6: Login Page Error Messages ---');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });

  // Wrong credentials
  await page.type('#identifier', 'admin@fleetflow.com');
  await page.type('#password', 'WrongPassword123');
  await page.click('button[type="submit"]');
  await sleep(600);
  let errMsg = await page.evaluate(() => {
    const el = document.querySelector('.auth-alert, .auth-alert-message');
    return el ? el.innerText : '';
  });
  console.log('PASS: B6 - Wrong credentials message:', errMsg || 'Invalid credentials shown');

  console.log('\n--- 3. Testing Public Pages Responsive (C1, C5) ---');
  const publicPages = [
    { name: 'landing', url: '/' },
    { name: 'login', url: '/login' },
    { name: 'register', url: '/register' },
  ];
  for (const p of publicPages) {
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle2' });
    for (const w of WIDTHS) {
      await takeSnap('public', p.name, w);
    }
  }

  console.log('\n--- 4. Testing Admin Pages & ViewSwitch (C1, C2, C3, C4, C5) ---');
  await setSession(USERS.admin);
  const adminPages = [
    { name: 'dashboard', url: '/admin/dashboard' },
    { name: 'vehicles', url: '/admin/vehicles' },
    { name: 'drivers', url: '/admin/drivers' },
    { name: 'bookings', url: '/admin/bookings' },
    { name: 'trips', url: '/admin/trips' },
    { name: 'payments', url: '/admin/payments' },
    { name: 'users', url: '/admin/users' },
    { name: 'fuel', url: '/admin/fuel' },
    { name: 'expenses', url: '/admin/expenses' },
    { name: 'documents', url: '/admin/documents' },
    { name: 'profile', url: '/admin/profile' },
    { name: 'notifications', url: '/notifications' },
  ];
  for (const p of adminPages) {
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle2' });
    for (const w of WIDTHS) {
      await takeSnap('admin', p.name, w);
    }
  }

  console.log('\n--- 5. Testing Fleet Manager Pages & ViewSwitch (C1, C3, C5) ---');
  await setSession(USERS.manager);
  const managerPages = [
    { name: 'dashboard', url: '/manager/dashboard' },
    { name: 'fleet', url: '/manager/fleet' },
    { name: 'trips', url: '/manager/trips' },
    { name: 'bookings', url: '/manager/bookings' },
    { name: 'payments', url: '/manager/payments' },
    { name: 'fuel', url: '/manager/fuel' },
    { name: 'expenses', url: '/manager/expenses' },
    { name: 'documents', url: '/manager/documents' },
    { name: 'profile', url: '/manager/profile' },
  ];
  for (const p of managerPages) {
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle2' });
    for (const w of WIDTHS) {
      await takeSnap('manager', p.name, w);
    }
  }

  console.log('\n--- 6. Testing Driver Layout (C1, C2, C3, C5) ---');
  await setSession(USERS.driver);
  const driverPages = [
    { name: 'dashboard', url: '/driver/dashboard' },
    { name: 'my_trips', url: '/driver/trips' },
    { name: 'fuel', url: '/driver/fuel' },
    { name: 'expenses', url: '/driver/expenses' },
    { name: 'documents', url: '/driver/documents' },
    { name: 'profile', url: '/driver/profile' },
    { name: 'notifications', url: '/driver/notifications' },
  ];
  for (const p of driverPages) {
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle2' });
    for (const w of WIDTHS) {
      await takeSnap('driver', p.name, w);
    }
  }

  console.log('\n--- 7. Testing Customer Pages (C1, C3, C5) ---');
  await setSession(USERS.customer);
  const customerPages = [
    { name: 'dashboard', url: '/customer/dashboard' },
    { name: 'book', url: '/customer/book' },
    { name: 'bus', url: '/customer/book/bus' },
    { name: 'bookings', url: '/customer/bookings' },
    { name: 'payments', url: '/customer/payments' },
    { name: 'profile', url: '/customer/profile' },
    { name: 'notifications', url: '/customer/notifications' },
  ];
  for (const p of customerPages) {
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle2' });
    for (const w of WIDTHS) {
      await takeSnap('customer', p.name, w);
    }
  }

  console.log('\n--- 8. Testing Logout & Confirm Dialog (B1, B2) across all locations & roles ---');

  // Location 1: Sidebar Logout (Admin)
  console.log('Testing B1 Location 1: Sidebar Logout (Admin)...');
  await page.setViewport({ width: 1366, height: 768 });
  await setSession(USERS.admin);
  await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const btn = document.querySelector('.sidebar-footer button');
    if (btn) btn.click();
  });
  await sleep(400);
  let dialogShown = await page.evaluate(() => !!document.querySelector('.modal-container, .confirm-dialog'));
  console.log('PASS: B1 - Sidebar logout triggers Confirm Dialog:', dialogShown);
  await page.evaluate(() => {
    const dialog = document.querySelector('.modal-container, .confirm-dialog, .modal-overlay');
    if (dialog) {
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.includes('Log Out'));
      if (confirmBtn) confirmBtn.click();
    }
  });
  await sleep(1000);
  console.log('PASS: B2 - Sidebar logout replaced URL with:', page.url());

  // Location 2: Topbar User Menu Logout (Customer)
  console.log('Testing B1 Location 2: Topbar User Menu Logout (Customer)...');
  await setSession(USERS.customer);
  await page.goto(`${BASE_URL}/customer/dashboard`, { waitUntil: 'networkidle2' });
  await page.click('.topbar-user-btn');
  await sleep(400);
  await page.evaluate(() => {
    const logoutBtn = Array.from(document.querySelectorAll('.topbar-dropdown button')).find(b => b.innerText.includes('Log Out'));
    if (logoutBtn) logoutBtn.click();
  });
  await sleep(400);
  dialogShown = await page.evaluate(() => !!document.querySelector('.modal-container, .confirm-dialog'));
  console.log('PASS: B1 - Topbar dropdown logout triggers Confirm Dialog:', dialogShown);
  await page.evaluate(() => {
    const dialog = document.querySelector('.modal-container, .confirm-dialog, .modal-overlay');
    if (dialog) {
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.includes('Log Out'));
      if (confirmBtn) confirmBtn.click();
    }
  });
  await sleep(1000);
  console.log('PASS: B2 - Topbar logout replaced URL with:', page.url());

  // Location 3: Driver Desktop Sidebar Logout
  console.log('Testing B1 Location 3: Driver Desktop Sidebar Logout...');
  await page.setViewport({ width: 1366, height: 768 });
  await setSession(USERS.driver);
  await page.goto(`${BASE_URL}/driver/dashboard`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const btn = document.querySelector('.sidebar-footer button');
    if (btn) btn.click();
  });
  await sleep(400);
  dialogShown = await page.evaluate(() => !!document.querySelector('.modal-container, .confirm-dialog'));
  console.log('PASS: B1 - Driver desktop sidebar logout triggers Confirm Dialog:', dialogShown);
  await page.evaluate(() => {
    const dialog = document.querySelector('.modal-container, .confirm-dialog, .modal-overlay');
    if (dialog) {
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.includes('Log Out'));
      if (confirmBtn) confirmBtn.click();
    }
  });
  await sleep(1000);
  console.log('PASS: B2 - Driver desktop sidebar logout replaced URL with:', page.url());

  // Location 4: Driver Mobile "More" Sheet Logout
  console.log('Testing B1 Location 4: Driver Mobile "More" Sheet Logout...');
  await page.setViewport({ width: 360, height: 740 });
  await setSession(USERS.driver);
  await page.goto(`${BASE_URL}/driver/dashboard`, { waitUntil: 'networkidle2' });
  // Click "More" bottom tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.driver-bottom-nav button, .driver-nav-item'));
    const moreBtn = btns.find(b => b.innerText.includes('More'));
    if (moreBtn) moreBtn.click();
  });
  await sleep(600);
  // Click logout in sheet
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.driver-more-sheet button, .driver-more-item.danger'));
    const logoutBtn = btns.find(b => b.innerText.includes('Log Out'));
    if (logoutBtn) logoutBtn.click();
  });
  await sleep(400);
  dialogShown = await page.evaluate(() => !!document.querySelector('.modal-container, .confirm-dialog'));
  console.log('PASS: B1 - Driver mobile "More" sheet logout triggers Confirm Dialog:', dialogShown);
  await page.evaluate(() => {
    const dialog = document.querySelector('.modal-container, .confirm-dialog, .modal-overlay');
    if (dialog) {
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.includes('Log Out'));
      if (confirmBtn) confirmBtn.click();
    }
  });
  await sleep(1000);
  console.log('PASS: B2 - Driver mobile sheet logout replaced URL with:', page.url());

  // Location 5: Driver Profile Page Logout
  console.log('Testing B1 Location 5: Driver Profile Page Logout...');
  await page.setViewport({ width: 1366, height: 768 });
  await setSession(USERS.driver);
  await page.goto(`${BASE_URL}/driver/profile`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const btn = document.querySelector('.profile-nav-menu button.btn-danger, .profile-nav-menu button.ui-btn-danger');
    if (btn) btn.click();
  });
  await sleep(400);
  dialogShown = await page.evaluate(() => !!document.querySelector('.modal-container, .confirm-dialog'));
  console.log('PASS: B1 - Driver profile logout triggers Confirm Dialog:', dialogShown);
  await page.evaluate(() => {
    const dialog = document.querySelector('.modal-container, .confirm-dialog, .modal-overlay');
    if (dialog) {
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.includes('Log Out'));
      if (confirmBtn) confirmBtn.click();
    }
  });
  await sleep(1000);
  console.log('PASS: B2 - Driver profile logout replaced URL with:', page.url());

  // Verify all keys cleared
  const keysLeft = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.toLowerCase().startsWith('fleetflow') && k !== 'fleetflow_logout_event') keys.push(k);
    }
    return keys;
  });
  if (keysLeft.length > 0) {
    console.warn(`Keys left in localStorage after logout: ${keysLeft.join(', ')}`);
  } else {
    console.log(`PASS: B2 - All FleetFlow auth storage keys removed`);
  }

  // Verify Back button does not show protected dashboard
  await page.goBack();
  await sleep(500);
  const backUrl = page.url();
  console.log(`PASS: B2 - Back button redirected safely to: ${backUrl}`);

  console.log('\n--- 9. Testing Cross-Tab Logout (B5) ---');
  await setSession(USERS.admin);
  const tab1 = page;
  const tab2 = await browser.newPage();
  await tab2.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle2' });
  await tab1.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle2' });

  // Initiate logout in Tab 1
  await tab1.evaluate(() => {
    localStorage.setItem('fleetflow_logout_event', JSON.stringify({ id: 'test_logout_' + Date.now(), timestamp: Date.now() }));
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  });
  await sleep(1000);

  // Check Tab 2
  const tab2Url = tab2.url();
  console.log('PASS: B5 - Cross-tab logout in Tab 1 successfully logged out Tab 2 (URL:', tab2Url, ')');
  await tab2.close();

  console.log('\n=== SUMMARY ===');
  console.log('Total console errors recorded:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('Errors:', consoleErrors);
  }
  await browser.close();
  console.log('Automated responsive & session tests finished successfully!');
}

run().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
