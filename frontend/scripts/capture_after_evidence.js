const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const tempUserDir = path.join(os.tmpdir(), `puppeteer_capture_after_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // 1. Manager Login
  console.log('Logging in as Fleet Manager...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.waitForSelector('input[name="identifier"], input[type="text"]', { timeout: 8000 });
  await page.type('input[name="identifier"], input[type="text"]', 'manager@fleetflow.com');
  await page.type('input[name="password"], input[type="password"]', 'Demo@12345');
  await page.click('button[type="submit"]');
  await sleep(2500);

  // 1. Assignments Page
  console.log('Capturing Manager Assignments...');
  await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_assignments_split_view.png') });
  console.log('Saved after_manager_assignments_split_view.png');

  // 2. Manager Fuel Page
  console.log('Capturing Manager Fuel Review...');
  await page.goto('http://localhost:3000/manager/fuel', { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_fuel_review.png') });
  console.log('Saved after_manager_fuel_review.png');

  // 3. Manager Documents Page
  console.log('Capturing Manager Documents Review...');
  await page.goto('http://localhost:3000/manager/documents', { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_manager_documents_review.png') });
  console.log('Saved after_manager_documents_review.png');

  // 4. Driver Login
  console.log('Logging in as Driver...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.waitForSelector('input[name="identifier"], input[type="text"]', { timeout: 8000 });
  await page.type('input[name="identifier"], input[type="text"]', 'driver1@fleetflow.com');
  await page.type('input[name="password"], input[type="password"]', 'Demo@12345');
  await page.click('button[type="submit"]');
  await sleep(2500);

  // 5. Driver Fuel Modal
  console.log('Capturing Driver Fuel Modal...');
  await page.goto('http://localhost:3000/driver/fuel', { waitUntil: 'networkidle2' });
  await sleep(2000);
  const logFuelBtn = await page.$('button.btn-primary');
  if (logFuelBtn) {
    await logFuelBtn.click();
    await sleep(1000);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_driver_fuel_modal.png') });
  console.log('Saved after_driver_fuel_modal.png');

  // 6. Driver Documents Modal
  console.log('Capturing Driver Documents Modal...');
  await page.goto('http://localhost:3000/driver/documents', { waitUntil: 'networkidle2' });
  await sleep(2000);
  const uploadDocBtn = await page.$('button.btn-primary');
  if (uploadDocBtn) {
    await uploadDocBtn.click();
    await sleep(1000);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_driver_documents_modal.png') });
  console.log('Saved after_driver_documents_modal.png');

  // 7. Driver Expenses Modal
  console.log('Capturing Driver Expenses Modal...');
  await page.goto('http://localhost:3000/driver/expenses', { waitUntil: 'networkidle2' });
  await sleep(2000);
  const logExpBtn = await page.$('button.btn-primary');
  if (logExpBtn) {
    await logExpBtn.click();
    await sleep(1000);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_driver_expenses_modal.png') });
  console.log('Saved after_driver_expenses_modal.png');

  await browser.close();
  console.log('All screenshots captured successfully.');
})();