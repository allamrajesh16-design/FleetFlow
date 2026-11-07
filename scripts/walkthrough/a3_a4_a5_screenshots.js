const puppeteer = require('../../frontend/node_modules/puppeteer-core');
const os = require('os');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/guide/images/admin');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: path.join(os.tmpdir(), 'chrome_a3_a4_a5_' + Date.now()),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#login-identifier-input, input[name="identifier"], input[type="text"]', 'wt.admin+1@gmail.com');
  await page.type('#login-password-input, input[name="password"], input[type="password"]', process.env.WT_PASSWORD || 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await sleep(2500);

  // A3 Approvals screenshots
  await page.goto('http://localhost:3000/admin/approvals', { waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a3_2_approve_fm.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a3_3_reject_driver.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a3_4_approve_driver.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a3_5_reapprove_blocked.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a3_6_pending_dropped.png') });

  // A4 Vehicles screenshots
  await page.goto('http://localhost:3000/admin/vehicles', { waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_1b_bus_no_min.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_2_invalid_vehicles.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_2b_negative_rate.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_2c_min_seats_rule.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_3_edit_vehicle.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_4_vehicle_status.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_5_filter_vehicles.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_6_delete_vehicle.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a4_7_delete_ontrip_blocked.png') });

  // A5 Drivers screenshots
  await page.goto('http://localhost:3000/admin/drivers', { waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a5_2_invalid_driver.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a5_3_edit_driver.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a5_3b_fm_assign_excluded.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a5_4_filter_drivers.png') });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a5_5_delete_driver.png') });

  console.log('Saved all individual A3, A4, A5 screenshots');
  await browser.close();
})();

