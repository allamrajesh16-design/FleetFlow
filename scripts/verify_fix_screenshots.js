const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function verifyFixes() {
  console.log('=== VERIFYING FIXES FOR DRIVER DOCUMENTS & CUSTOMER DASHBOARD ===');
  const tempUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_pup_'));
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    userDataDir: tempUserDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=0'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    // 1. Driver Documents Check
    console.log('1. Checking Driver Documents at /driver/documents...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('#identifier, input[type="text"]', { timeout: 10000 });
    await page.type('#identifier, input[type="text"]', 'wt.driver+1@gmail.com');
    await page.type('#password, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 2500));
    console.log('   Logged in Driver URL:', page.url());

    await page.goto('http://localhost:3000/driver/documents', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2500));

    const driverPic = path.join(ARTIFACT_DIR, 'fixed_driver_documents.png');
    await page.screenshot({ path: driverPic, fullPage: false });
    console.log('   Driver Documents screenshot captured:', driverPic);

    // 2. Customer Dashboard Check
    console.log('2. Checking Customer Dashboard at /customer/dashboard...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('#identifier, input[type="text"]', { timeout: 10000 });
    await page.type('#identifier, input[type="text"]', 'wt.demo.s1.cust@gmail.com');
    await page.type('#password, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 2500));
    console.log('   Logged in Customer URL:', page.url());

    await page.goto('http://localhost:3000/customer/dashboard', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2500));

    const customerPic = path.join(ARTIFACT_DIR, 'fixed_customer_dashboard.png');
    await page.screenshot({ path: customerPic, fullPage: false });
    console.log('   Customer Dashboard screenshot captured:', customerPic);

    console.log('=== ALL FIXES CAPTURED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Error during verification:', err);
    throw err;
  } finally {
    await browser.close();
    try {
      fs.rmSync(tempUserDir, { recursive: true, force: true });
    } catch {}
  }
}

verifyFixes().catch(err => {
  console.error(err);
  process.exit(1);
});
