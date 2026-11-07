const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity-ide\\brain\\5110db00-4143-41c9-b6a8-657e74db382b';
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'fleet_manager_403_admin_users.png');
const LOCAL_SCREENSHOT_PATH = 'C:\\Users\\RAJESH\\Desktop\\FleetFlow\\fleet_manager_403_admin_users.png';

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Launching local Google Chrome for full 4-role verification...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });

  const testResults = [];

  const roleConfigs = [
    {
      roleName: 'FLEET_MANAGER',
      email: 'manager@fleetflow.com',
      password: 'Demo@12345',
      expectedHome: '/manager/dashboard',
      links: [
        '/manager/dashboard',
        '/manager/approvals',
        '/manager/bookings',
        '/manager/assignments',
        '/manager/trips',
        '/manager/bus-monitor',
        '/manager/fleet',
        '/manager/maintenance',
        '/manager/fuel',
        '/manager/expenses',
        '/manager/documents',
        '/manager/payments',
        '/manager/reports',
      ],
      foreignUrl: '/admin/users',
      isFm: true,
    },
    {
      roleName: 'ADMIN',
      email: 'admin@fleetflow.com',
      password: 'Demo@12345',
      expectedHome: '/admin/dashboard',
      links: [
        '/admin/dashboard',
        '/admin/users',
        '/admin/approvals',
        '/admin/vehicles',
        '/admin/drivers',
        '/admin/bookings',
        '/admin/trips',
        '/admin/bus-schedules',
        '/admin/payments',
        '/admin/fuel',
        '/admin/expenses',
        '/admin/documents',
        '/admin/reports',
        '/admin/settings',
      ],
      foreignUrl: '/manager/dashboard',
      isFm: false,
    },
    {
      roleName: 'DRIVER',
      email: 'driver1@fleetflow.com',
      password: 'Demo@12345',
      expectedHome: '/driver/dashboard',
      links: [
        '/driver/dashboard',
        '/driver/trips',
        '/driver/history',
        '/driver/fuel',
        '/driver/expenses',
        '/driver/documents',
        '/notifications',
        '/profile',
      ],
      foreignUrl: '/manager/fleet',
      isFm: false,
    },
    {
      roleName: 'CUSTOMER',
      email: 'customer1@fleetflow.com',
      password: 'Demo@12345',
      expectedHome: '/customer/dashboard',
      links: [
        '/customer/dashboard',
        '/customer/book',
        '/customer/bookings',
        '/customer/payments',
        '/notifications',
        '/profile',
      ],
      foreignUrl: '/driver/dashboard',
      isFm: false,
    },
  ];

  for (const cfg of roleConfigs) {
    console.log(`\n======================================================`);
    console.log(` Testing Role: ${cfg.roleName} (${cfg.email})`);
    console.log(`======================================================`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
      // 1. Clear state
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
      await delay(400);

      // Check if "Sign in as a different user" button is visible
      const switchBtn = await page.$('button ::-p-text("Sign in as a different user")');
      if (switchBtn) {
        await switchBtn.click();
        await delay(500);
      }

      // 2. Type credentials
      await page.waitForSelector('#identifier', { visible: true });
      await page.click('#identifier');
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type('#identifier', cfg.email, { delay: 15 });

      await page.click('#password');
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type('#password', cfg.password, { delay: 15 });

      // Click Login
      console.log(`  Submitting login form...`);
      await page.click('button[type="submit"]');

      // Wait up to 5s for dashboard URL
      let reached = false;
      for (let i = 0; i < 20; i++) {
        await delay(250);
        const cur = page.url();
        if (cur.includes(cfg.expectedHome)) {
          reached = true;
          break;
        }
      }
      console.log(`  Login result URL: ${page.url()} (Expected ${cfg.expectedHome}: ${reached ? '✓' : '✗'})`);

      // 3. Test all sidebar / nav links
      let linkErrors = 0;
      for (const linkPath of cfg.links) {
        await page.goto(`${BASE_URL}${linkPath}`, { waitUntil: 'networkidle2' });
        await delay(300);
        const curUrl = page.url();
        const isUnauth = curUrl.includes('/unauthorized');
        if (isUnauth) linkErrors++;
        console.log(`  [Link] ${linkPath.padEnd(24)} -> ${curUrl} ${!isUnauth ? '✓ PASS' : '✗ FAIL (403)'}`);
      }

      // 4. Test opening foreign role route by URL -> MUST show 403 page
      console.log(`  Opening foreign route by URL: ${cfg.foreignUrl}`);
      await page.goto(`${BASE_URL}${cfg.foreignUrl}`, { waitUntil: 'networkidle2' });
      await delay(600);
      const foreignResultUrl = page.url();
      const foreignGot403 = foreignResultUrl.includes('/unauthorized');
      console.log(`  [Foreign Check] ${cfg.foreignUrl} -> ${foreignResultUrl} ${foreignGot403 ? '✓ PASS (403 shown)' : '✗ FAIL'}`);

      // If Fleet Manager, check all required elements and capture screenshot
      if (cfg.isFm && foreignGot403) {
        const bodyText = await page.evaluate(() => document.body.innerText);
        const hasAdminLine = bodyText.includes('This page is for: Admin');
        const hasFmLine = bodyText.includes('You are signed in as: Fleet Manager');
        const hasPathText = bodyText.includes('/admin/users');
        const hasDashBtn = bodyText.includes('Go to my dashboard');
        const hasBackBtn = bodyText.includes('Go back');
        const hasSignOutBtn = bodyText.includes('Sign out');

        console.log(`  403 Screen Verification for Fleet Manager on /admin/users:`);
        console.log(`    - "This page is for: Admin": ${hasAdminLine ? '✓' : '✗'}`);
        console.log(`    - "You are signed in as: Fleet Manager": ${hasFmLine ? '✓' : '✗'}`);
        console.log(`    - Technical path "/admin/users": ${hasPathText ? '✓' : '✗'}`);
        console.log(`    - "Go to my dashboard" button: ${hasDashBtn ? '✓' : '✗'}`);
        console.log(`    - "Go back" button: ${hasBackBtn ? '✓' : '✗'}`);
        console.log(`    - "Sign out" button: ${hasSignOutBtn ? '✓' : '✗'}`);

        if (!fs.existsSync(ARTIFACT_DIR)) {
          fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
        }
        await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
        await page.screenshot({ path: LOCAL_SCREENSHOT_PATH, fullPage: true });
        console.log(`  ✓ Captured 403 screenshot to: ${SCREENSHOT_PATH}`);
      }

      testResults.push({
        role: cfg.roleName,
        linksTested: cfg.links.length,
        linkErrors,
        foreign403: foreignGot403,
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log('\n================================================================');
  console.log('                 FINAL END-TO-END BROWSER MATRIX');
  console.log('================================================================');
  console.log('Role           | Total Links | Landed on 403? | Foreign Route 403?');
  console.log('----------------------------------------------------------------');
  for (const r of testResults) {
    console.log(
      `${r.role.padEnd(14)} | ${String(r.linksTested).padEnd(11)} | ${r.linkErrors === 0 ? '0 (None) ✓' : `${r.linkErrors} FAILS`}      | ${r.foreign403 ? 'PASS (403) ✓' : 'FAIL'}`
    );
  }
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
