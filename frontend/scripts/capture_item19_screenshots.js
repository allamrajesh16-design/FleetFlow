const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const SCREENSHOT_DIR = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', '19');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Simple static server for frontend build
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(BUILD_DIR, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(BUILD_DIR, 'index.html');
  }
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  server.listen(3002, async () => {
    console.log('Serving frontend build on port 3002...');
    let browser;
    try {
      const tempUserDataDir = path.join(__dirname, '..', '..', 'temp_chrome_profile_' + Date.now());
      browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        userDataDir: tempUserDataDir,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1400,900'],
      });

      const page = await browser.newPage();

      async function capture(name, width, height) {
        await page.setViewport({ width, height });
        await sleep(600);
        const dest = path.join(SCREENSHOT_DIR, `${name}-${width}.png`);
        await page.screenshot({ path: dest, fullPage: false });
        console.log(`Saved screenshot: ${name}-${width}.png`);
      }

      // 1. Customer Vehicle Select (/customer/book)
      // Inject auth state into localStorage first
      await page.goto('http://localhost:3002/login');
      await page.evaluate(() => {
        const dummyUser = {
          id: 10,
          full_name: 'Test Customer',
          email: 'customer@fleetflow.com',
          role: 'CUSTOMER',
          phone: '+919876543210',
          approval_status: 'APPROVED',
          is_email_verified: true,
          date_joined: '2026-01-15T10:00:00Z',
        };
        localStorage.setItem('fleetflow_user', JSON.stringify(dummyUser));
        localStorage.setItem('fleetflow_token', 'mock_access_token_123');
      });

      // Navigate to /customer/book
      await page.goto('http://localhost:3002/customer/book', { waitUntil: 'networkidle0' });
      await sleep(1000);
      await capture('01-customer-vehicle-select', 1366, 768);
      await capture('01-customer-vehicle-select', 360, 640);

      // 2. Profile View (Customer)
      await page.goto('http://localhost:3002/profile', { waitUntil: 'networkidle0' });
      await sleep(800);
      await capture('02-customer-profile-view', 1366, 768);
      await capture('02-customer-profile-view', 360, 640);

      // 3. Edit Profile Modal
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Edit Profile'));
        if (btn) btn.click();
      });
      await sleep(500);
      await capture('03-edit-profile-modal', 1366, 768);
      await capture('03-edit-profile-modal', 360, 640);

      // Close edit modal
      await page.keyboard.press('Escape');
      await sleep(300);

      // 4. Change Password Modal
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Change Password'));
        if (btn) btn.click();
      });
      await sleep(500);
      await capture('04-change-password-modal', 1366, 768);
      await capture('04-change-password-modal', 360, 640);

      // Close password modal
      await page.keyboard.press('Escape');
      await sleep(300);

      // 5. Driver Profile View (with driver credentials)
      await page.evaluate(() => {
        const driverUser = {
          id: 5,
          full_name: 'Rajesh Driver',
          email: 'driver@fleetflow.com',
          role: 'DRIVER',
          phone: '+919123456789',
          approval_status: 'APPROVED',
          is_email_verified: true,
          date_joined: '2026-02-10T11:00:00Z',
          driver_profile: {
            license_number: 'DL-2024-9876543',
            license_expiry: '2028-12-31',
            status: 'AVAILABLE'
          }
        };
        localStorage.setItem('fleetflow_user', JSON.stringify(driverUser));
      });
      await page.goto('http://localhost:3002/profile', { waitUntil: 'networkidle0' });
      await sleep(800);
      await capture('05-driver-profile-view', 1366, 768);
      await capture('05-driver-profile-view', 360, 640);

      // 6. Admin Profile View
      await page.evaluate(() => {
        const adminUser = {
          id: 1,
          full_name: 'Admin System',
          email: 'admin@fleetflow.com',
          role: 'ADMIN',
          phone: '+919999999999',
          approval_status: 'APPROVED',
          is_email_verified: true,
          date_joined: '2025-10-01T08:00:00Z',
        };
        localStorage.setItem('fleetflow_user', JSON.stringify(adminUser));
      });
      await page.goto('http://localhost:3002/profile', { waitUntil: 'networkidle0' });
      await sleep(800);
      await capture('06-admin-profile-view', 1366, 768);
      await capture('06-admin-profile-view', 360, 640);

      // 7. Fleet Manager Profile View
      await page.evaluate(() => {
        const fmUser = {
          id: 2,
          full_name: 'Manager Operations',
          email: 'manager@fleetflow.com',
          role: 'FLEET_MANAGER',
          phone: '+919888888888',
          approval_status: 'APPROVED',
          is_email_verified: true,
          date_joined: '2025-11-15T09:00:00Z',
        };
        localStorage.setItem('fleetflow_user', JSON.stringify(fmUser));
      });
      await page.goto('http://localhost:3002/profile', { waitUntil: 'networkidle0' });
      await sleep(800);
      await capture('07-fleet-manager-profile-view', 1366, 768);
      await capture('07-fleet-manager-profile-view', 360, 640);

      // 8. Logout Dialog (Opening state)
      // Trigger logout button in sidebar
      await page.evaluate(() => {
        const logoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign Out') || b.textContent.includes('Logout'));
        if (logoutBtn) logoutBtn.click();
      });
      await sleep(500);
      await capture('08-logout-dialog-open', 1366, 768);
      await capture('08-logout-dialog-open', 360, 640);

      console.log('All screenshots captured successfully into docs/screenshots/19/ !');
    } catch (e) {
      console.error('Error during screenshot capture:', e);
    } finally {
      if (browser) await browser.close();
      server.close();
      process.exit(0);
    }
  });
}

run();
