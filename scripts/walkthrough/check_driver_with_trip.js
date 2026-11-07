const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function testDriverWithTrip() {
  const tempUserDir = path.join(os.tmpdir(), `puppeteer_driver_trip_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Login as driver with trip: wt.driver+1@gmail.com
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 5000 });
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.driver+1@gmail.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  // Fuel Page
  await page.goto('http://localhost:3000/driver/fuel', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  const fuelAddBtn = await page.$('button.btn-primary');
  console.log('Fuel Add Button exists:', !!fuelAddBtn);
  if (fuelAddBtn) {
    await fuelAddBtn.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'driver_fuel_modal_open.png') });
    const modalFields = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('.modal-overlay input, .modal-overlay select, .modal-overlay textarea'));
      return els.map(e => ({ id: e.id, label: e.getAttribute('aria-label') || e.name || e.id }));
    });
    console.log('Driver Fuel Modal form fields:', modalFields);
  }

  // Documents Page
  await page.goto('http://localhost:3000/driver/documents', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'driver_documents_page_view.png') });
  const docBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
  });
  console.log('Driver Documents page buttons:', docBtns);

  // Expenses Page
  await page.goto('http://localhost:3000/driver/expenses', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  const expAddBtn = await page.$('button.btn-primary');
  if (expAddBtn) {
    await expAddBtn.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'driver_expenses_modal_open.png') });
    const expFields = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('.modal-overlay input, .modal-overlay select, .modal-overlay textarea'));
      return els.map(e => ({ id: e.id, label: e.getAttribute('aria-label') || e.name || e.id }));
    });
    console.log('Driver Expenses Modal form fields:', expFields);
  }

  await browser.close();
}

testDriverWithTrip().catch(err => {
  console.error(err);
  process.exit(1);
});

