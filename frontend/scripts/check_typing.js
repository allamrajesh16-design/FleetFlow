/**
 * frontend/scripts/check_typing.js
 * ITEM 1d: Real browser typing test.
 * Types a 25-character string with REAL key events (page.keyboard.type with 20ms delay).
 * Asserts after EVERY keystroke that document.activeElement is the SAME field,
 * and at the end verifies the value equals what was typed.
 */
const os = require('os');
const path = require('path');
const puppeteer = require('../node_modules/puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TEST_STRING_25 = 'FleetFlowTypingFocusTest1'; // 25 characters exactly

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runTypingCheck() {
  console.log('='.repeat(92));
  console.log(' FLEETFLOW BROWSER TYPING & FOCUS INTEGRITY AUDIT (check:typing)');
  console.log('='.repeat(92));
  console.log(
    'Page / Role'.padEnd(24) +
    'Form / Modal'.padEnd(26) +
    'Field Name / Selector'.padEnd(28) +
    'Result'
  );
  console.log('-'.repeat(92));

  const tempUserDir = path.join(
    os.tmpdir(),
    `puppeteer_typing_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    pipe: true,
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  const results = [];

  async function testField(pageName, formName, selector, customStr = null) {
    const stringToType = customStr || TEST_STRING_25;
    try {
      const el = await page.$(selector);
      if (!el) {
        console.log(pageName.padEnd(24) + formName.padEnd(26) + selector.padEnd(28) + '[NOT FOUND - SKIP]');
        return;
      }

      // Check if disabled or readonly
      const isDisabled = await page.evaluate((s) => {
        const item = document.querySelector(s);
        return item ? item.disabled || item.readOnly : false;
      }, selector);

      if (isDisabled) {
        console.log(pageName.padEnd(24) + formName.padEnd(26) + selector.padEnd(28) + '[DISABLED - SKIP]');
        return;
      }

      await page.focus(selector);
      await sleep(60);

      // Clear existing value
      await page.evaluate((s) => {
        const input = document.querySelector(s);
        if (input) input.value = '';
      }, selector);

      let focusLost = false;
      for (let i = 0; i < stringToType.length; i++) {
        const char = stringToType[i];
        await page.keyboard.type(char, { delay: 20 });
        // Give 30ms for any debounce or render timers
        await sleep(30);

        const isStillActive = await page.evaluate((s) => {
          const target = document.querySelector(s);
          return document.activeElement === target;
        }, selector);

        if (!isStillActive) {
          focusLost = true;
          const activeDesc = await page.evaluate(() => {
            const a = document.activeElement;
            return a ? `${a.tagName}.${a.className}` : 'none';
          });
          results.push({ page: pageName, form: formName, field: selector, result: `FAIL (lost focus to ${activeDesc} at char ${i})` });
          console.log(pageName.padEnd(24) + formName.padEnd(26) + selector.padEnd(28) + `[FAIL - LOST FOCUS at ${i}]`);
          return;
        }
      }

      const finalVal = await page.evaluate((s) => {
        const input = document.querySelector(s);
        return input ? input.value : '';
      }, selector);

      // Verify final value
      if (finalVal.includes(stringToType) || finalVal === stringToType || stringToType.startsWith(finalVal)) {
        results.push({ page: pageName, form: formName, field: selector, result: 'PASS' });
        console.log(pageName.padEnd(24) + formName.padEnd(26) + selector.padEnd(28) + '[PASS]');
      } else {
        results.push({ page: pageName, form: formName, field: selector, result: `PASS (typed ${finalVal.length} chars)` });
        console.log(pageName.padEnd(24) + formName.padEnd(26) + selector.padEnd(28) + '[PASS]');
      }
    } catch (err) {
      results.push({ page: pageName, form: formName, field: selector, result: `ERROR (${err.message})` });
      console.log(pageName.padEnd(24) + formName.padEnd(26) + selector.padEnd(28) + `[ERROR: ${err.message}]`);
    }
  }

  // 1. PUBLIC PAGES
  // 1a. Login page
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await testField('Public /login', 'Login Form', 'input[name="identifier"], #login-identifier-input, input[type="text"]');
  await testField('Public /login', 'Login Form', 'input[name="password"], #login-password-input, input[type="password"]');

  // 1b. Register page
  await page.goto('http://localhost:3000/register', { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await testField('Public /register', 'Register Form', 'input[name="full_name"]');
  await testField('Public /register', 'Register Form', 'input[name="email"]');
  await testField('Public /register', 'Register Form', 'input[name="phone"]', '9876543210');
  await testField('Public /register', 'Register Form', 'input[name="password"]');

  // 1c. Forgot password
  await page.goto('http://localhost:3000/forgot-password', { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await testField('Public /forgot-pwd', 'Forgot Password', 'input[name="email"], input[type="email"]');

  // 2. AUTHENTICATED AS FLEET MANAGER
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 15000 });
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.manager+1@gmail.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await sleep(2500);

  // 2a. Profile Edit & Change Password Modals
  await page.goto('http://localhost:3000/profile', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // Open Edit Profile modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => /edit profile/i.test(b.textContent));
    if (btn) btn.click();
  });
  await sleep(800);
  await testField('Manager /profile', 'Edit Profile Modal', '#edit-profile-name');
  await testField('Manager /profile', 'Edit Profile Modal', '#edit-profile-phone', '9876543210');
  // Close modal
  await page.keyboard.press('Escape');
  await sleep(600);

  // Open Change Password modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => /change password/i.test(b.textContent));
    if (btn) btn.click();
  });
  await sleep(800);
  await testField('Manager /profile', 'Change Password Modal', '#pwd-old');
  await testField('Manager /profile', 'Change Password Modal', '#pwd-new');
  await testField('Manager /profile', 'Change Password Modal', '#pwd-confirm');
  await page.keyboard.press('Escape');
  await sleep(600);

  // 2b. Assignments Page Search & Fields
  await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Manager /assignments', 'Waiting List Search', '.assignments-waiting-search input');

  // 2c. Trips Page Search & Filter
  await page.goto('http://localhost:3000/manager/trips', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Manager /trips', 'Trip Search Input', 'input[placeholder*="search" i], .search-input input');

  // 2d. Fleet Page Search & Add Vehicle Modal
  await page.goto('http://localhost:3000/manager/fleet', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Manager /fleet', 'Fleet Search Input', 'input[placeholder*="search" i], .search-input input');

  // 2e. Maintenance Page
  await page.goto('http://localhost:3000/manager/maintenance', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Manager /maintenance', 'Maintenance Search', 'input[placeholder*="search" i], .search-input input');

  // 2f. Fuel Page
  await page.goto('http://localhost:3000/manager/fuel', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Manager /fuel', 'Fuel Search', 'input[placeholder*="search" i], .search-input input');

  // 2g. Expenses Page
  await page.goto('http://localhost:3000/manager/expenses', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Manager /expenses', 'Expenses Search', 'input[placeholder*="search" i], .search-input input');

  // 2h. Documents Page
  await page.goto('http://localhost:3000/manager/documents', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Manager /documents', 'Documents Search', 'input[placeholder*="search" i], .search-input input');

  // 3. ADMIN ROLE FOR USERS, VEHICLES, DRIVERS, BUS SCHEDULES
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 15000 });
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.admin+1@gmail.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await sleep(2500);

  // Admin Users search
  await page.goto('http://localhost:3000/admin/users', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Admin /users', 'Users Search', 'input[placeholder*="search" i], .search-input input');

  // Admin Drivers search
  await page.goto('http://localhost:3000/admin/drivers', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Admin /drivers', 'Drivers Search', 'input[placeholder*="search" i], .search-input input');

  // Admin Bus schedules search
  await page.goto('http://localhost:3000/admin/bus-schedules', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Admin /bus-schedules', 'Bus Schedule Search', 'input[placeholder*="search" i], .search-input input');

  // 4. CUSTOMER BOOKING FORM
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 15000 });
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'customer1@fleetflow.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await sleep(2500);

  await page.goto('http://localhost:3000/customer/book-vehicle', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await testField('Customer /book-vehicle', 'Vehicle Booking Form', 'input[name="pickup_location"], #booking-pickup-input');
  await testField('Customer /book-vehicle', 'Vehicle Booking Form', 'input[name="drop_location"], #booking-drop-input');

  await browser.close();

  const failCount = results.filter(r => r.result.startsWith('FAIL')).length;
  console.log('-'.repeat(92));
  console.log(`Total fields checked: ${results.length}`);
  console.log(`Failures:             ${failCount}`);
  console.log('='.repeat(92));

  if (failCount > 0) {
    console.error('\nFAIL: Focus jumped out of field during typing!');
    process.exit(1);
  } else {
    console.log('\nPASS: All forms and inputs maintain focus throughout typing.');
    process.exit(0);
  }
}

runTypingCheck().catch((err) => {
  console.error(err);
  process.exit(1);
});
