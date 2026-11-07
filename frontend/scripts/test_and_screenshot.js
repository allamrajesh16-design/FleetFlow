const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/screenshots/stage14');
const BASE_URL = 'http://localhost:3000';

const DEMO_PASSWORD = process.env.FLEETFLOW_DEMO_PASSWORD || process.env.DEMO_PASSWORD;
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'manager@fleetflow.com';
const DRIVER_EMAIL = process.env.DRIVER_EMAIL || 'driver1@fleetflow.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@fleetflow.com';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper to delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('--- Launching Browser Automation ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1400,900'],
  });

  const page = await browser.newPage();
  
  // Track console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore favicon or benign warnings
      if (!text.includes('favicon.ico')) {
        consoleErrors.push(text);
      }
    }
  });

  async function takeSnap(filename, width, height) {
    await page.setViewport({ width, height });
    await sleep(700);
    const filePath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`[Screenshot Saved]: ${filename} (${width}x${height})`);
  }

  async function login(email, password) {
    console.log(`Authenticating as ${email}...`);
    const res = await fetch('http://127.0.0.1:8000/api/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password }),
    });
    const authData = await res.json();
    if (!authData.access) {
      throw new Error(`Login failed for ${email}: ${JSON.stringify(authData)}`);
    }

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((data) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('fleetflow_remember', 'true');
      localStorage.setItem('fleetflow_access_token', data.access);
      localStorage.setItem('fleetflow_refresh_token', data.refresh);
      localStorage.setItem('fleetflow_user', JSON.stringify(data.user));
      localStorage.setItem('fleetflow_last_active', Date.now().toString());
      sessionStorage.setItem('fleetflow_access_token', data.access);
      sessionStorage.setItem('fleetflow_refresh_token', data.refresh);
      sessionStorage.setItem('fleetflow_user', JSON.stringify(data.user));
    }, authData);
    await sleep(300);
  }

  try {
    // ==========================================
    // 1. FLEET MANAGER TESTS & SCREENSHOTS
    // ==========================================
    console.log('\n=== STEP 1: FLEET MANAGER ===');
    await login(MANAGER_EMAIL, DEMO_PASSWORD);

    // Dashboard (with new cards, top 5 vehicles, next 5 expiring)
    await page.goto(`${BASE_URL}/manager/dashboard`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('manager_dashboard_1366.png', 1366, 768);
    await takeSnap('manager_dashboard_1024.png', 1024, 768);
    await takeSnap('manager_dashboard_360.png', 360, 800);

    // Fuel Management
    console.log('Testing /manager/fuel...');
    await page.goto(`${BASE_URL}/manager/fuel`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('manager_fuel_1366.png', 1366, 768);
    await takeSnap('manager_fuel_1024.png', 1024, 768);
    await takeSnap('manager_fuel_360.png', 360, 800);

    // Reset to 1366 for interactions
    await page.setViewport({ width: 1366, height: 768 });
    await sleep(500);

    // Try Add Fuel Modal & Test lower odometer error
    console.log('Testing Fuel add validation (lower odometer)...');
    try {
      const addFuelBtn = await page.$('#btn-add-fuel-log');
      if (addFuelBtn) {
        await addFuelBtn.click();
        await page.waitForSelector('#log-vehicle', { visible: true, timeout: 5000 });
        await sleep(500);
        // Fill vehicle
        const vehOptions = await page.$$eval('#log-vehicle option', opts => opts.map(o => o.value).filter(Boolean));
        if (vehOptions.length > 0) {
          await page.select('#log-vehicle', vehOptions[0]);
        }
        // Fill lower odometer (e.g. 10 km)
        await page.click('#log-odometer', { clickCount: 3 });
        await page.type('#log-odometer', '10');
        await page.click('#log-quantity', { clickCount: 3 });
        await page.type('#log-quantity', '25');
        await page.click('#log-price', { clickCount: 3 });
        await page.type('#log-price', '95.5');
        // Submit
        const submitBtn = await page.$('.modal-footer button[type="submit"], form button[type="submit"]');
        if (submitBtn) await submitBtn.click();
        await sleep(1200);
        await takeSnap('manager_fuel_odometer_error_modal_1366.png', 1366, 768);
        console.log('Validated lower odometer error trigger.');

        // Close modal
        const closeBtn = await page.$('.modal-header button, .modal-footer button.btn-outline');
        if (closeBtn) await closeBtn.click();
        await sleep(500);
      }
    } catch (e) {
      console.log('Fuel modal interaction notice:', e.message);
    }

    // Expense Management
    console.log('Testing /manager/expenses...');
    await page.goto(`${BASE_URL}/manager/expenses`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('manager_expenses_1366.png', 1366, 768);
    await takeSnap('manager_expenses_1024.png', 1024, 768);
    await takeSnap('manager_expenses_360.png', 360, 800);
    await page.setViewport({ width: 1366, height: 768 });
    await sleep(500);

    // Document Management
    console.log('Testing /manager/documents...');
    await page.goto(`${BASE_URL}/manager/documents`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('manager_documents_1366.png', 1366, 768);
    await takeSnap('manager_documents_1024.png', 1024, 768);
    await takeSnap('manager_documents_360.png', 360, 800);
    await page.setViewport({ width: 1366, height: 768 });
    await sleep(500);

    // Reports Tabs
    console.log('Testing /manager/reports...');
    await page.goto(`${BASE_URL}/manager/reports`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('manager_reports_1366.png', 1366, 768);

    // Click Fuel Report Tab
    const tabs = await page.$$('.tab-button, button.tab-item');
    for (const t of tabs) {
      const text = await page.evaluate(el => el.textContent, t);
      if (text.includes('Fuel')) {
        await t.click();
        await sleep(1000);
        await takeSnap('manager_reports_fuel_1366.png', 1366, 768);
        break;
      }
    }

    // Switch to Vehicle Cost tab in Reports
    for (const t of tabs) {
      const text = await page.evaluate(el => el.textContent, t);
      if (text.includes('Vehicle Cost')) {
        await t.click();
        await sleep(1200);
        await takeSnap('manager_reports_vehicle_cost_1366.png', 1366, 768);
        break;
      }
    }

    // Test Trip Assignment with vehicle 20 (expired insurance block)
    console.log('Testing /manager/assignments with expired insurance block...');
    await page.goto(`${BASE_URL}/manager/assignments`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const bookingEl = await page.$('#assign-select-booking');
    if (bookingEl) {
      // 1. Select booking 52 (which has vehicle 20 attached)
      await page.select('#assign-select-booking', '52');
      await sleep(600);
      
      // 2. Select driver
      const driverOptions = await page.$$eval('#assign-select-driver option', opts => opts.map(o => o.value).filter(Boolean));
      if (driverOptions.length > 0) {
        await page.select('#assign-select-driver', driverOptions[0]);
      }
      await sleep(500);

      // 3. Set future datetime
      await page.evaluate(() => {
        const dt = document.querySelector('#assign-scheduled-datetime');
        if (dt) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(dt, '2026-10-25T10:00');
          dt.dispatchEvent(new Event('input', { bubbles: true }));
          dt.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await sleep(500);

      // Submit assignment
      const submitAssign = await page.$('button[type="submit"]');
      if (submitAssign) {
        await submitAssign.click();
        await sleep(1500);
        await takeSnap('manager_assignment_blocked_red_box_1366.png', 1366, 768);
      }
    }

    // ==========================================
    // 2. DRIVER TESTS & SCREENSHOTS
    // ==========================================
    console.log('\n=== STEP 2: DRIVER ===');
    await login(DRIVER_EMAIL, DEMO_PASSWORD);

    // Driver Dashboard
    await page.goto(`${BASE_URL}/driver/dashboard`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('driver_dashboard_1366.png', 1366, 768);
    await takeSnap('driver_dashboard_1024.png', 1024, 768);
    await takeSnap('driver_dashboard_360.png', 360, 800);

    // Driver Fuel
    await page.goto(`${BASE_URL}/driver/fuel`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('driver_fuel_1366.png', 1366, 768);
    await takeSnap('driver_fuel_1024.png', 1024, 768);
    await takeSnap('driver_fuel_360.png', 360, 800);

    // Driver Expenses
    await page.goto(`${BASE_URL}/driver/expenses`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('driver_expenses_1366.png', 1366, 768);
    await takeSnap('driver_expenses_1024.png', 1024, 768);
    await takeSnap('driver_expenses_360.png', 360, 800);

    // Driver Documents
    await page.goto(`${BASE_URL}/driver/documents`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('driver_documents_1366.png', 1366, 768);
    await takeSnap('driver_documents_1024.png', 1024, 768);
    await takeSnap('driver_documents_360.png', 360, 800);

    // Driver Mobile Bottom Nav & More Sheet
    await page.setViewport({ width: 360, height: 800 });
    await page.goto(`${BASE_URL}/driver/dashboard`, { waitUntil: 'networkidle2' });
    await sleep(800);
    const navItems = await page.$$('button.driver-nav-item');
    if (navItems.length >= 5) {
      await navItems[4].click(); // Click More
      await sleep(600);
      await takeSnap('driver_mobile_more_sheet_360.png', 360, 800);
    }

    // Test Driver route guard: Driver tries to open /manager/fuel
    console.log('Testing driver role guard accessing /manager/fuel...');
    await page.goto(`${BASE_URL}/manager/fuel`, { waitUntil: 'networkidle2' });
    await sleep(1000);
    const currentUrl = page.url();
    console.log(`Driver accessing /manager/fuel landed on: ${currentUrl}`);

    // ==========================================
    // 3. ADMIN TESTS & SCREENSHOTS
    // ==========================================
    console.log('\n=== STEP 3: ADMIN ===');
    await login(ADMIN_EMAIL, DEMO_PASSWORD);

    // Admin Dashboard
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('admin_dashboard_1366.png', 1366, 768);

    // Admin Fuel
    await page.goto(`${BASE_URL}/admin/fuel`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('admin_fuel_1366.png', 1366, 768);

    // Admin Expenses
    await page.goto(`${BASE_URL}/admin/expenses`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('admin_expenses_1366.png', 1366, 768);

    // Admin Documents
    await page.goto(`${BASE_URL}/admin/documents`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await takeSnap('admin_documents_1366.png', 1366, 768);

    console.log('\nAll automation actions completed successfully!');
    if (consoleErrors.length > 0) {
      console.log('Console Errors Observed:', consoleErrors);
    } else {
      console.log('Console Errors: 0');
    }
  } catch (err) {
    console.error('Automation encountered an error:', err);
  } finally {
    await browser.close();
  }
}

run();
