const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const tempUserDir = path.join(os.tmpdir(), `puppeteer_capture_driver_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Driver Login
  console.log('Logging in as Driver directly...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="identifier"], input[type="text"]', { timeout: 10000 });
  await page.type('input[name="identifier"], input[type="text"]', 'driver1@fleetflow.com');
  await page.type('input[name="password"], input[type="password"]', 'Demo@12345');
  await page.click('button[type="submit"]');
  await sleep(3000);

  // 1. Driver Fuel Modal
  console.log('Capturing Driver Fuel Modal...');
  await page.goto('http://localhost:3000/driver/fuel', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const logFuelBtn = await page.$('button.btn-primary');
  if (logFuelBtn) {
    await logFuelBtn.click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_driver_fuel_modal.png') });
  console.log('Saved after_driver_fuel_modal.png');

  // 2. Driver Documents Modal
  console.log('Capturing Driver Documents Modal...');
  await page.goto('http://localhost:3000/driver/documents', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const uploadDocBtn = await page.$('button.btn-primary');
  if (uploadDocBtn) {
    await uploadDocBtn.click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_driver_documents_modal.png') });
  console.log('Saved after_driver_documents_modal.png');

  // 3. Driver Expenses Modal
  console.log('Capturing Driver Expenses Modal...');
  await page.goto('http://localhost:3000/driver/expenses', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const logExpBtn = await page.$('button.btn-primary');
  if (logExpBtn) {
    await logExpBtn.click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'after_driver_expenses_modal.png') });
  console.log('Saved after_driver_expenses_modal.png');

  await browser.close();
  console.log('Driver screenshots captured successfully.');
})();

