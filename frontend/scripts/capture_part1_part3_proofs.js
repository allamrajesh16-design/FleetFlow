const puppeteer = require('../node_modules/puppeteer-core');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const tempUserDir = path.join(
    os.tmpdir(),
    `puppeteer_proofs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  async function loginAs(email) {
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', {
      timeout: 15000,
    });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', email);
    await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');
    await sleep(2500);
  }

  // 1. FLEET MANAGER
  console.log('Logging in as Fleet Manager...');
  await loginAs('wt.manager+1@gmail.com');

  // Check Sidebar expanded
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_sidebar_expanded_256.png') });
  console.log('Saved after_sidebar_expanded_256.png');

  // Toggle Sidebar to Rail
  const toggleBtn = await page.$('.sidebar-rail-toggle');
  if (toggleBtn) {
    await toggleBtn.click();
    await sleep(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_sidebar_rail_72.png') });
    console.log('Saved after_sidebar_rail_72.png');
    // Toggle back
    await toggleBtn.click();
    await sleep(400);
  }

  // Manager Assignments at 1366px, 1024px, 360px
  console.log('Capturing Manager Assignments across viewports...');
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'domcontentloaded' });
  await sleep(1800);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_assignments_1366.png') });
  console.log('Saved after_manager_assignments_1366.png');

  await page.setViewport({ width: 1024, height: 768 });
  await sleep(500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_assignments_1024.png') });
  console.log('Saved after_manager_assignments_1024.png');

  await page.setViewport({ width: 360, height: 740 });
  await sleep(500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_assignments_360.png') });
  console.log('Saved after_manager_assignments_360.png');

  // Manager Fuel with nowrap buttons and ReviewDrawer
  console.log('Capturing Manager Fuel & Review Drawer...');
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/manager/fuel', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_fuel_table_1366.png') });
  console.log('Saved after_manager_fuel_table_1366.png');

  // Open Review Drawer
  const reviewBtnHandle = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find((b) => b.textContent.trim().includes('Review')) || null;
  });
  if (reviewBtnHandle && reviewBtnHandle.asElement()) {
    await reviewBtnHandle.asElement().click();
    await sleep(600);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_fuel_review_drawer_1366.png') });
    console.log('Saved after_manager_fuel_review_drawer_1366.png');

    await page.setViewport({ width: 360, height: 740 });
    await sleep(400);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_fuel_review_drawer_360.png') });
    console.log('Saved after_manager_fuel_review_drawer_360.png');
  }

  // 2. ADMIN APPROVALS
  console.log('Logging in as Admin for Approvals...');
  await loginAs('wt.admin+1@gmail.com');
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/admin/approvals', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_admin_approvals_nowrap_1366.png') });
  console.log('Saved after_admin_approvals_nowrap_1366.png');

  await page.setViewport({ width: 768, height: 768 });
  await sleep(500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_admin_approvals_nowrap_768.png') });
  console.log('Saved after_admin_approvals_nowrap_768.png');

  await page.setViewport({ width: 360, height: 740 });
  await sleep(500);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_admin_approvals_nowrap_360.png') });
  console.log('Saved after_admin_approvals_nowrap_360.png');

  await browser.close();
  console.log('All visual proof screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
