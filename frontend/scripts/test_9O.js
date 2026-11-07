const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SCREENSHOT_DIR = 'C:/Users/RAJESH/Desktop/FleetFlow/docs/screenshots/9O';
const BASE_URL = 'http://localhost:3000';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('--- Launching 9O Automation ---');
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
      // Ignore network noise or benign favicon
      if (!text.includes('favicon.ico') && !text.includes('401 (Unauthorized)')) {
        consoleErrors.push(text);
      }
    }
  });

  async function takeSnap(filename, width = 1366, height = 768) {
    await page.setViewport({ width, height });
    await sleep(600);
    const filePath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`[Screenshot Saved]: ${filename} (${width}x${height})`);
  }

  async function loginAs(email, password = 'Demo@12345') {
    const res = await fetch('http://127.0.0.1:8000/api/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password }),
    });
    const authData = await res.json();
    if (!authData.access) {
      throw new Error(`Login failed for ${email}`);
    }

    await page.goto(`${BASE_URL}/login`);
    await page.evaluate((data) => {
      localStorage.clear();
      localStorage.setItem('fleetflow_token', data.access);
      localStorage.setItem('fleetflow_refresh', data.refresh);
      localStorage.setItem('fleetflow_user', JSON.stringify(data.user));
    }, authData);
    await sleep(400);
  }

  try {
    // 1. Register with phone error
    console.log('1. Testing Register phone error...');
    await page.goto(`${BASE_URL}/register`);
    await sleep(800);
    // Select Driver role (phone is required)
    await page.select('select[name="role"]', 'DRIVER');
    // Type repeated digits phone number
    const phoneInput = await page.$('input[name="phone"]');
    if (phoneInput) {
      await phoneInput.type('9999999999');
      // Trigger blur/change
      await page.keyboard.press('Tab');
      await sleep(500);
    }
    // Also try submit
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await sleep(600);
    await takeSnap('register_phone_error.png', 1366, 768);

    // 2. Toasts display
    console.log('2. Testing Toasts display...');
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('fleetflow-toast', {
          detail: { type: 'success', message: 'OTP sent to your email' },
        })
      );
    });
    await sleep(300);
    await takeSnap('toasts_display.png', 1366, 768);

    // 3. OTP Page
    console.log('3. Testing OTP page...');
    await page.goto(`${BASE_URL}/verify-otp?email=customer1%40fleetflow.com`);
    await sleep(800);
    await takeSnap('otp_page.png', 1366, 768);

    // 4. Login messages
    console.log('4. Testing Login messages...');
    await page.goto(`${BASE_URL}/login`);
    await sleep(400);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await sleep(800);
    await page.type('#identifier', 'wronguser@fleetflow.com');
    await page.type('#password', 'WrongPassword123');
    const loginBtn = await page.$('button[type="submit"]');
    if (loginBtn) await loginBtn.click();
    await sleep(1000);
    await takeSnap('login_messages.png', 1366, 768);

    // 5 & 6. Book a Vehicle at 1366px and 360px
    console.log('5 & 6. Testing Book a Vehicle form...');
    await loginAs('customer1@fleetflow.com');
    await page.goto(`${BASE_URL}/customer/book/vehicle`);
    await sleep(1200);
    await takeSnap('book_vehicle_1366px.png', 1366, 768);
    await takeSnap('book_vehicle_360px.png', 360, 740);

    // 7. Notification link for Admin
    console.log('7. Testing Notification link for Admin...');
    await loginAs('admin@fleetflow.com');
    await page.goto(`${BASE_URL}/notifications`);
    await sleep(1000);
    // Click the first notification
    const firstNotif = await page.$('.notification-item');
    if (firstNotif) {
      await firstNotif.click();
      await sleep(1000);
    }
    await takeSnap('notification_admin.png', 1366, 768);

    // 8. Notification link for Fleet Manager
    console.log('8. Testing Notification link for Fleet Manager...');
    await loginAs('manager@fleetflow.com');
    await page.goto(`${BASE_URL}/notifications`);
    await sleep(1000);
    const mgrNotif = await page.$('.notification-item');
    if (mgrNotif) {
      await mgrNotif.click();
      await sleep(1000);
    }
    await takeSnap('notification_manager.png', 1366, 768);

    // 9. Notification link for Driver
    console.log('9. Testing Notification link for Driver...');
    await loginAs('driver1@fleetflow.com');
    await page.goto(`${BASE_URL}/notifications`);
    await sleep(1000);
    const drvNotif = await page.$('.notification-item');
    if (drvNotif) {
      await drvNotif.click();
      await sleep(1000);
    }
    await takeSnap('notification_driver.png', 1366, 768);

    // 10. Notification link for Customer
    console.log('10. Testing Notification link for Customer...');
    await loginAs('customer1@fleetflow.com');
    await page.goto(`${BASE_URL}/notifications`);
    await sleep(1000);
    const custNotif = await page.$('.notification-item');
    if (custNotif) {
      await custNotif.click();
      await sleep(1000);
    }
    await takeSnap('notification_customer.png', 1366, 768);

    console.log('--- All tests and screenshots completed successfully! ---');
    console.log('Total console errors encountered:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors);
    }
  } catch (err) {
    console.error('Error during automation:', err);
  } finally {
    await browser.close();
  }
}

run();
