const puppeteer = require('C:/Users/RAJESH/Desktop/FleetFlow/frontend/node_modules/puppeteer-core');
const fs = require('fs');

async function testLoginMessages() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,768'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // 1. C7b: Pending approval
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#identifier', 'wt.pending.mgr@gmail.com');
  await page.type('#password', 'Walkthrough@2026!Sec');
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'docs/screenshots/batch1b/c7b_pending_approval.png' });
  const textPending = await page.evaluate(() => document.body.innerText);

  // 2. C7c: Rejected with reason
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#identifier', 'wt.rejected.drv@gmail.com');
  await page.type('#password', 'Walkthrough@2026!Sec');
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'docs/screenshots/batch1b/c7c_rejected.png' });
  const textRejected = await page.evaluate(() => document.body.innerText);

  // 3. C7d: Inactive account
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#identifier', 'wt.inactive.cust@gmail.com');
  await page.type('#password', 'Walkthrough@2026!Sec');
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'docs/screenshots/batch1b/c7d_inactive.png' });
  const textInactive = await page.evaluate(() => document.body.innerText);

  // 4. C7e: Unverified email
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#identifier', 'wt.unverified.cust@gmail.com');
  await page.type('#password', 'Walkthrough@2026!Sec');
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'docs/screenshots/batch1b/c7e_unverified.png' });
  const textUnverified = await page.evaluate(() => document.body.innerText);

  console.log('Pending text found:', textPending.includes('pending') || textPending.includes('Pending') || textPending.includes('approval'));
  console.log('Rejected text found:', textRejected.includes('rejected') || textRejected.includes('Rejected') || textRejected.includes('Invalid commercial badge'));
  console.log('Inactive text found:', textInactive.includes('inactive') || textInactive.includes('Inactive') || textInactive.includes('disabled'));
  console.log('Unverified text found:', textUnverified.includes('verify') || textUnverified.includes('Verify') || textUnverified.includes('OTP'));

  await browser.close();
}

testLoginMessages();

