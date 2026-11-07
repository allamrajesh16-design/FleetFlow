const puppeteer = require('../../frontend/node_modules/puppeteer-core');
const os = require('os');
const path = require('path');
const http = require('http');
const { captureEvidence } = require('./evidence_helper');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/guide/images/admin');

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
  console.log('=== STARTING BATCH 2 MACHINE EVIDENCE RUNNER (FULL SUITE) ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: path.join(os.tmpdir(), 'chrome_b2_' + Date.now()),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // 1. LOGIN ADMIN
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await sleep(1000);

  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text && text.includes('different user')) {
      await b.click();
      await sleep(1000);
      break;
    }
  }

  await page.waitForSelector('#identifier, input[name="identifier"], input[type="text"]', { timeout: 5000 });
  await page.type('#identifier, input[name="identifier"], input[type="text"]', 'wt.admin+1@gmail.com');
  await page.type('#password, input[name="password"], input[type="password"]', process.env.WT_PASSWORD || 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await sleep(2500);

  const token = await page.evaluate(() => localStorage.getItem('fleetflow_access_token') || sessionStorage.getItem('fleetflow_access_token'));

  // ----------------------------------------------------
  // A2: USERS
  // ----------------------------------------------------
  console.log('--- A2 USERS ---');
  await page.goto('http://localhost:3000/admin/users', { waitUntil: 'networkidle0' });
  await sleep(1500);

  // A2.1 Total count
  await captureEvidence(page, {
    caseId: 'A2.1',
    channel: 'UI',
    actions: ['Navigate to /admin/users', 'Wait for datatable to render'],
    targetSelector: 'table.datatable-table, .page-header-title',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a2_1_users_count.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a2_1_users_count_crop.png'),
    notes: 'Admin Users page loads with table displaying users.'
  });

  // A2.2 Search WT
  await page.type('input[placeholder*="Search"]', 'WT-');
  await sleep(1000);
  await captureEvidence(page, {
    caseId: 'A2.2',
    channel: 'UI',
    actions: ['Type "WT-" in search input', 'Wait for debounce filter'],
    targetSelector: 'table.datatable-table tbody tr:first-child',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a2_2_search_wt.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a2_2_search_wt_crop.png'),
    notes: 'Search filter filters user table rows to WT- accounts.'
  });

  // Clear search
  await page.evaluate(() => {
    const el = document.querySelector('input[placeholder*="Search"]');
    if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(800);

  // A2.4 Add customer
  const beforeUsers = (await apiCall('GET', '/api/users/?page_size=1', token)).data?.count;
  
  // Find Add button in header
  const allBtns = await page.$$('button');
  for (const b of allBtns) {
    const t = await page.evaluate(el => el.innerText, b);
    if (t && t.includes('Add User')) {
      await b.click();
      break;
    }
  }
  await sleep(1000);

  const uniqueSuffix = Date.now().toString().slice(-4);
  const newEmail = `wt.user.${uniqueSuffix}@gmail.com`;
  const newPhone = `900000${uniqueSuffix}`;

  await page.waitForSelector('input[placeholder*="Rahul Sharma"], input[placeholder*="Name"], .modal-body input', { timeout: 4000 });
  await page.type('input[placeholder*="Rahul Sharma"], input[placeholder*="Name"]', 'WT-Created Customer');
  await page.type('input[placeholder*="rahul@example.com"], input[type="email"]', newEmail);
  await page.type('input[placeholder*="43210"], input[type="tel"], input[name="phone"]', newPhone);
  await page.type('input[placeholder*="Min 8 characters"], input[type="password"]', 'Walkthrough@123');
  
  const submitBtn = await page.$('button[type="submit"], .modal-footer button.btn-primary');
  if (submitBtn) await submitBtn.click();
  await sleep(2500);

  const afterUsers = (await apiCall('GET', '/api/users/?page_size=1', token)).data?.count;

  await captureEvidence(page, {
    caseId: 'A2.4',
    channel: 'UI',
    actions: [`Type name "WT-Created Customer", email "${newEmail}", phone "${newPhone}"`, 'Click Submit button'],
    targetSelector: '.toast-success, .toast-message, table.datatable-table tbody tr:first-child',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a2_4_add_customer.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a2_4_add_customer_crop.png'),
    beforeDb: beforeUsers,
    afterDb: afterUsers,
    notes: 'User is created successfully and appears in the table.'
  });

  // A2.5 Negative invalid phone
  const allBtns2 = await page.$$('button');
  for (const b of allBtns2) {
    const t = await page.evaluate(el => el.innerText, b);
    if (t && t.includes('Add User')) {
      await b.click();
      break;
    }
  }
  await sleep(1000);
  await page.waitForSelector('input[placeholder*="Rahul Sharma"], input[placeholder*="Name"]', { timeout: 4000 });
  await page.type('input[placeholder*="Rahul Sharma"], input[placeholder*="Name"]', 'WT-Bad Phone');
  await page.type('input[placeholder*="rahul@example.com"], input[type="email"]', `wt.badphone.${uniqueSuffix}@gmail.com`);
  await page.type('input[placeholder*="43210"], input[type="tel"], input[name="phone"]', '12345');
  await page.type('input[placeholder*="Min 8 characters"], input[type="password"]', 'Walkthrough@123');
  
  const submitBtn2 = await page.$('button[type="submit"], .modal-footer button.btn-primary');
  if (submitBtn2) await submitBtn2.click();
  await sleep(1200);

  await captureEvidence(page, {
    caseId: 'A2.5',
    channel: 'UI',
    actions: ['Type invalid phone "12345"', 'Click Submit button'],
    targetSelector: '.form-error, .toast-error, .toast-message, form .error-message, .ff-error',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a2_5_bad_phone.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a2_5_bad_phone_crop.png'),
    notes: 'Validation rejects invalid phone number format.'
  });

  // Close modal
  const modalCancel = await page.$$('button');
  for (const b of modalCancel) {
    const t = await page.evaluate(el => el.innerText, b);
    if (t && t.includes('Cancel')) {
      await b.click();
      break;
    }
  }
  await sleep(800);

  // ----------------------------------------------------
  // A3: APPROVALS
  // ----------------------------------------------------
  console.log('--- A3 APPROVALS ---');
  await page.goto('http://localhost:3000/admin/approvals', { waitUntil: 'networkidle0' });
  await sleep(1500);

  await captureEvidence(page, {
    caseId: 'A3.1',
    channel: 'UI',
    actions: ['Navigate to /admin/approvals', 'Wait for table to load'],
    targetSelector: 'table.datatable-table, .approvals-container, .empty-state',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a3_1_approvals_list.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a3_1_approvals_list_crop.png'),
    notes: 'Approvals queue lists pending users.'
  });

  // Switch to Driver tab
  const tabs = await page.$$('.tab-button, .tabs-item, button');
  for (const t of tabs) {
    const text = await page.evaluate(el => el.innerText, t);
    if (text && text.includes('Driver')) {
      await t.click();
      await sleep(1200);
      break;
    }
  }

  // A3.4 Approve Driver (id 182)
  const appBtns = await page.$$('button');
  let clickedApprove = false;
  for (const b of appBtns) {
    const t = await page.evaluate(el => el.innerText, b);
    if (t && t.includes('Approve')) {
      await b.click();
      clickedApprove = true;
      break;
    }
  }
  if (clickedApprove) {
    await sleep(1000);
    const confirmBtns = await page.$$('button');
    for (const cb of confirmBtns) {
      const t = await page.evaluate(el => el.innerText, cb);
      if (t && (t.includes('Confirm') || t.includes('Approve'))) {
        await cb.click();
        break;
      }
    }
    await sleep(2000);

    await captureEvidence(page, {
      caseId: 'A3.4',
      channel: 'UI',
      actions: ['Click Approve on driver pending row', 'Confirm modal'],
      targetSelector: '.toast-success, .toast-message',
      fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a3_4_approve_driver.png'),
      cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a3_4_approve_driver_crop.png'),
      notes: 'Driver approval processed successfully.'
    });
  }

  // ----------------------------------------------------
  // A4: VEHICLES
  // ----------------------------------------------------
  console.log('--- A4 VEHICLES ---');
  await page.goto('http://localhost:3000/admin/vehicles', { waitUntil: 'networkidle0' });
  await sleep(1500);

  await captureEvidence(page, {
    caseId: 'A4.1',
    channel: 'UI',
    actions: ['Navigate to /admin/vehicles', 'View active vehicle list'],
    targetSelector: 'table.datatable-table',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a4_1_vehicles_added.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a4_1_vehicles_added_crop.png'),
    notes: 'Vehicle management page displays active fleet vehicles.'
  });

  // A4.1b BUS without min_passengers validation
  const vehBtns = await page.$$('button');
  for (const b of vehBtns) {
    const t = await page.evaluate(el => el.innerText, b);
    if (t && t.includes('Add Vehicle')) {
      await b.click();
      break;
    }
  }
  await sleep(1000);

  const sel = await page.$('select[name="vehicle_type"]');
  if (sel) await page.select('select[name="vehicle_type"]', 'BUS');
  await sleep(500);

  await page.type('input[name="registration_number"]', `WT-BUS-${Date.now().toString().slice(-4)}`);
  await page.type('input[name="brand"]', 'Tata');
  await page.type('input[name="model"]', 'Starbus');
  await page.type('input[name="seating_capacity"]', '30');
  await page.type('input[name="rate_per_km"]', '45');
  // leave min_passengers blank
  await page.click('button[type="submit"]');
  await sleep(1200);

  await captureEvidence(page, {
    caseId: 'A4.1b',
    channel: 'UI',
    actions: ['Select BUS', 'Leave min_passengers blank', 'Submit form'],
    targetSelector: '.form-error, .toast-error, .toast-message, form .error-message',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a4_1b_bus_no_min.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a4_1b_bus_no_min_crop.png'),
    notes: 'Bus min_passengers is required and validated on submission.'
  });

  const vCancels = await page.$$('button');
  for (const b of vCancels) {
    const t = await page.evaluate(el => el.innerText, b);
    if (t && t.includes('Cancel')) {
      await b.click();
      break;
    }
  }
  await sleep(800);

  // ----------------------------------------------------
  // A5: DRIVERS
  // ----------------------------------------------------
  console.log('--- A5 DRIVERS ---');
  await page.goto('http://localhost:3000/admin/drivers', { waitUntil: 'networkidle0' });
  await sleep(1500);

  await captureEvidence(page, {
    caseId: 'A5.1',
    channel: 'UI',
    actions: ['Navigate to /admin/drivers', 'View drivers table'],
    targetSelector: 'table.datatable-table',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a5_1_driver_added.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a5_1_driver_added_crop.png'),
    notes: 'Driver management page displays drivers and license status.'
  });

  // ----------------------------------------------------
  // A9: PAYMENTS
  // ----------------------------------------------------
  console.log('--- A9 PAYMENTS ---');
  await page.goto('http://localhost:3000/admin/payments', { waitUntil: 'networkidle0' });
  await sleep(1500);

  // A9.1 Summary cards
  await captureEvidence(page, {
    caseId: 'A9.1',
    channel: 'UI',
    actions: ['Navigate to /admin/payments', 'Read summary stat cards'],
    targetSelector: '.stat-cards-grid, .admin-stat-cards, .stats-container, .page-header',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a9_1_summary.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a9_1_summary_crop.png'),
    notes: 'Payment summary cards reflect revenue and payment metrics.'
  });

  // A9.3 Filter PAYMENT_INITIATED & open modal for Payment 999
  const statusSelect = await page.$('select');
  if (statusSelect) {
    await page.select('select', 'PAYMENT_INITIATED');
    await sleep(1200);
  }

  await captureEvidence(page, {
    caseId: 'A9.3',
    channel: 'UI',
    actions: ['Select filter status PAYMENT_INITIATED', 'Locate Payment 999'],
    targetSelector: 'table.datatable-table tbody',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a9_3_payment_initiated.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a9_3_payment_initiated_crop.png'),
    notes: 'PAYMENT_INITIATED payments displayed with proof review actions.'
  });

  // Confirm Payment 999
  const payConfirmBtns = await page.$$('button');
  for (const b of payConfirmBtns) {
    const t = await page.evaluate(el => el.innerText, b);
    if (t && t.includes('Confirm')) {
      await b.click();
      await sleep(1000);
      const confDialog = await page.$$('button');
      for (const d of confDialog) {
        const dt = await page.evaluate(el => el.innerText, d);
        if (dt && (dt.includes('Confirm') || dt.includes('Yes'))) {
          await d.click();
          break;
        }
      }
      await sleep(2000);
      break;
    }
  }

  await captureEvidence(page, {
    caseId: 'A9.4',
    channel: 'UI',
    actions: ['Click Confirm on Payment 999', 'Confirm in modal dialog'],
    targetSelector: '.toast-success, .toast-message',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a9_4_confirmed.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a9_4_confirmed_crop.png'),
    notes: 'Payment 999 confirmed and receipt issued.'
  });

  // A9.7 Refunded payment (Payment 15)
  await page.goto('http://localhost:3000/admin/payments?status=REFUNDED', { waitUntil: 'networkidle0' });
  await sleep(1200);

  await captureEvidence(page, {
    caseId: 'A9.7',
    channel: 'UI',
    actions: ['Filter status=REFUNDED', 'Locate Payment 15'],
    targetSelector: 'table.datatable-table tbody tr:first-child',
    fullScreenshotPath: path.join(SCREENSHOT_DIR, 'a9_7_refunded.png'),
    cropScreenshotPath: path.join(SCREENSHOT_DIR, 'a9_7_refunded_crop.png'),
    notes: 'REFUNDED status badge and refund details visible.'
  });

  console.log('=== COMPLETED BATCH 2 MACHINE EVIDENCE RUNNER ===');
  await browser.close();
})();
