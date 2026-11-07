const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function reproduceDriverForms() {
  const tempUserDir = path.join(os.tmpdir(), `puppeteer_driver_reproduce_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'pageerror', text: err.toString() }));

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

  console.log('--- REPRODUCE DRIVER WITH TRIP (driver.wt@example.com) ---');
  await login('driver.wt@example.com');

  // Check Driver Fuel Page
  await page.goto('http://localhost:3000/driver/fuel', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reproduce_driver_fuel_before.png') });
  const fuelAddBtn = await page.$('button.btn-primary');
  console.log('Driver Fuel Add Button exists:', !!fuelAddBtn);
  if (fuelAddBtn) {
    await fuelAddBtn.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reproduce_driver_fuel_modal_before.png') });
    const modalInputs = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('.modal-overlay input, .modal-overlay select, .modal-overlay textarea'));
      return inputs.map(i => ({ name: i.name || i.id, tag: i.tagName, type: i.type }));
    });
    console.log('Driver Fuel Modal form field count:', modalInputs.length);
  }

  // Check Driver Documents Page
  await page.goto('http://localhost:3000/driver/documents', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reproduce_driver_documents_before.png') });
  const docAddBtn = await page.$('button.btn-primary');
  console.log('Driver Documents Add/Upload Button exists:', !!docAddBtn);

  // Check Driver Expenses Page
  await page.goto('http://localhost:3000/driver/expenses', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reproduce_driver_expenses_before.png') });
  const expAddBtn = await page.$('button.btn-primary');
  console.log('Driver Expenses Add Button exists:', !!expAddBtn);
  if (expAddBtn) {
    await expAddBtn.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reproduce_driver_expenses_modal_before.png') });
  }

  // Check Manager Assignments Page
  console.log('--- REPRODUCE MANAGER ASSIGNMENTS PAGE ---');
  await login('manager.wt@example.com');
  await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reproduce_manager_assignments_before.png') });

  await browser.close();
  console.log('Reproduction screenshots and diagnostics saved successfully.');
}

reproduceDriverForms().catch(err => {
  console.error('Reproduction failed:', err);
  process.exit(1);
});

