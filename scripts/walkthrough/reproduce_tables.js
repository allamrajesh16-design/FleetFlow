const puppeteer = require('../../frontend/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPRODUCE_DIR = path.resolve(__dirname, '../../docs/guide/images/reproduce');

if (!fs.existsSync(REPRODUCE_DIR)) fs.mkdirSync(REPRODUCE_DIR, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Admin Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#login-identifier-input, input[name="identifier"], input[type="text"]', 'wt.admin+1@gmail.com');
  await page.type('#login-password-input, input[name="password"], input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  // 1. Admin Drivers
  await page.goto('http://localhost:3000/admin/drivers', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(REPRODUCE_DIR, 'before_admin_drivers.png') });

  const driversInspection = await page.evaluate(() => {
    const table = document.querySelector('table');
    const ths = Array.from(document.querySelectorAll('table thead th'));
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const firstRowTds = Array.from(document.querySelectorAll('table tbody tr:first-child td'));
    return {
      tablePresent: !!table,
      tableClasses: table ? table.className : null,
      thCount: ths.length,
      thTexts: ths.map(t => t.innerText.trim()),
      rowCount: rows.length,
      firstRowTdCount: firstRowTds.length,
      firstRowTdTexts: firstRowTds.map(t => t.innerText.trim()),
      alignments: ths.map((th, i) => {
        const td = firstRowTds[i];
        const thR = th.getBoundingClientRect();
        const tdR = td ? td.getBoundingClientRect() : null;
        return {
          col: i,
          th: th.innerText.trim(),
          thLeft: Math.round(thR.left),
          thWidth: Math.round(thR.width),
          td: td ? td.innerText.trim() : null,
          tdLeft: tdR ? Math.round(tdR.left) : null,
          tdWidth: tdR ? Math.round(tdR.width) : null,
          diffLeft: tdR ? Math.round(thR.left - tdR.left) : 'NO_TD'
        };
      })
    };
  });
  console.log('Admin Drivers inspection:\n', JSON.stringify(driversInspection, null, 2));

  // 2. Admin Bookings
  await page.goto('http://localhost:3000/admin/bookings', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(REPRODUCE_DIR, 'before_admin_bookings.png') });

  const bookingsColDiff = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('table thead th'));
    const tds = Array.from(document.querySelectorAll('table tbody tr:first-child td'));
    return ths.map((th, i) => {
      const td = tds[i];
      const thRect = th.getBoundingClientRect();
      const tdRect = td ? td.getBoundingClientRect() : null;
      return {
        col: i,
        thText: th.innerText.trim(),
        tdText: td ? td.innerText.trim() : null,
        thLeft: thRect.left,
        tdLeft: tdRect ? tdRect.left : null,
        diff: tdRect ? Math.abs(thRect.left - tdRect.left) : 'NO_TD'
      };
    });
  });
  console.log('Admin Bookings column alignment check:', JSON.stringify(bookingsColDiff, null, 2));

  // 3. Driver Trips
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#login-identifier-input, input[name="identifier"], input[type="text"]', 'wt.driver+1@gmail.com');
  await page.type('#login-password-input, input[name="password"], input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  await page.goto('http://localhost:3000/driver/trips', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(REPRODUCE_DIR, 'before_driver_trips.png') });

  console.log('Reproduction screenshots and column measurements taken.');
  await browser.close();
})();

