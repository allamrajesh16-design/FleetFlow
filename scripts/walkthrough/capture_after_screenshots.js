const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function captureAfterScreenshots() {
  const tempUserDir = path.join(os.tmpdir(), `puppeteer_after_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Helper login
  async function login(email) {
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 5000 });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', email);
    await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
  }

  // Admin Drivers
  await login('allamrajesh16@gmail.com');
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/admin/drivers', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after_admin_drivers_1366.png'), fullPage: false });

  // Admin Bookings
  await page.goto('http://localhost:3000/admin/bookings', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after_admin_bookings_1366.png'), fullPage: false });

  // Driver Trips
  await login('driver.wt@example.com');
  await page.goto('http://localhost:3000/driver/trips', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after_driver_trips_1366.png'), fullPage: false });

  // Mobile Driver Trips (360px)
  await page.setViewport({ width: 360, height: 740 });
  await page.goto('http://localhost:3000/driver/trips', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after_driver_trips_360.png'), fullPage: false });

  await browser.close();
  console.log('After screenshots captured successfully.');
}

captureAfterScreenshots().catch(err => {
  console.error('Error capturing after screenshots:', err);
  process.exit(1);
});
