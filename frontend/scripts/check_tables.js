const puppeteer = require('../node_modules/puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const WIDTHS = [1536, 1366, 1280, 1024, 768];

const PAGES_BY_ROLE = [
  // Admin pages
  {
    role: 'ADMIN',
    loginEmail: 'wt.admin+1@gmail.com',
    paths: [
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
      '/admin/maintenance',
      '/admin/reports'
    ]
  },
  // Fleet Manager pages
  {
    role: 'FLEET_MANAGER',
    loginEmail: 'wt.manager+1@gmail.com',
    paths: [
      '/manager/assignments',
      '/manager/approvals',
      '/manager/bookings',
      '/manager/trips',
      '/manager/fleet',
      '/manager/maintenance',
      '/manager/payments',
      '/manager/fuel',
      '/manager/expenses',
      '/manager/documents',
      '/manager/bus-monitor'
    ]
  },
  // Driver pages
  {
    role: 'DRIVER',
    loginEmail: 'wt.driver+1@gmail.com',
    paths: [
      '/driver/trips',
      '/driver/history',
      '/driver/fuel',
      '/driver/expenses',
      '/driver/documents'
    ]
  },
  // Customer pages
  {
    role: 'CUSTOMER',
    loginEmail: 'customer1@fleetflow.com',
    paths: [
      '/customer/my-bookings',
      '/customer/payments'
    ]
  }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runTableCheck() {
  console.log('='.repeat(96));
  console.log(' FLEETFLOW BROWSER TABLE COLUMN ALIGNMENT & HORIZONTAL SCROLL AUDIT (check:tables)');
  console.log('='.repeat(96));
  console.log(
    'Role'.padEnd(16) +
    'Page Path'.padEnd(28) +
    'Width'.padEnd(8) +
    'Table?'.padEnd(8) +
    'Max Left Diff'.padEnd(16) +
    'H-Scroll?'.padEnd(12) +
    'Result'
  );
  console.log('-'.repeat(96));

  const os = require('os');
  const pathMod = require('path');
  const tempUserDir = pathMod.join(os.tmpdir(), `puppeteer_table_check_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  let totalChecks = 0;
  let failedChecks = 0;

  for (const group of PAGES_BY_ROLE) {
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 15000 });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', group.loginEmail);
    await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');
    await sleep(2500);

    for (const pathUrl of group.paths) {
      for (const w of WIDTHS) {
        totalChecks++;
        await page.setViewport({ width: w, height: 800 });
        try {
          await page.goto(`http://localhost:3000${pathUrl}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (e) {
          // ignore navigation timeout
        }
        await sleep(1000);

        const evalResult = await page.evaluate(() => {
          const table = document.querySelector('table');
          const hasHScroll = document.documentElement.scrollWidth > window.innerWidth;

          if (!table) {
            return {
              hasTable: false,
              maxDiff: 0,
              hasHScroll,
              colCountMismatch: false
            };
          }

          const ths = Array.from(table.querySelectorAll('thead th'));
          const firstRow = table.querySelector('tbody tr:not(.datatable-tr-skeleton):not(.table-tr-skeleton)');
          const tds = firstRow ? Array.from(firstRow.querySelectorAll('td')) : [];

          let maxDiff = 0;
          let colCountMismatch = false;

          if (ths.length > 0 && tds.length > 0) {
            if (ths.length !== tds.length) {
              colCountMismatch = true;
            }
            const minCols = Math.min(ths.length, tds.length);
            for (let i = 0; i < minCols; i++) {
              const thRect = ths[i].getBoundingClientRect();
              const tdRect = tds[i].getBoundingClientRect();
              const diff = Math.abs(thRect.left - tdRect.left);
              if (diff > maxDiff) maxDiff = diff;
            }
          }

          return {
            hasTable: true,
            maxDiff: Math.round(maxDiff * 10) / 10,
            hasHScroll,
            colCountMismatch
          };
        });

        const isFail = evalResult.hasTable && (evalResult.maxDiff > 4 || evalResult.colCountMismatch || evalResult.hasHScroll);
        if (isFail) failedChecks++;

        const status = isFail ? 'FAIL' : 'PASS';

        console.log(
          group.role.padEnd(16) +
          pathUrl.padEnd(28) +
          (w + 'px').padEnd(8) +
          (evalResult.hasTable ? 'YES' : 'NO').padEnd(8) +
          (evalResult.hasTable ? evalResult.maxDiff + 'px' : '-').padEnd(16) +
          (evalResult.hasHScroll ? 'YES (FAIL)' : 'NO').padEnd(12) +
          status
        );
      }
    }
  }

  await browser.close();
  console.log('='.repeat(96));

  if (failedChecks > 0) {
    console.error(`FAILED: ${failedChecks} of ${totalChecks} table checks failed!`);
    process.exit(1);
  } else {
    console.log(`SUCCESS: All ${totalChecks} table column alignment and scroll checks passed with 0 failures!`);
  }
}

runTableCheck().catch(err => {
  console.error('Check tables crashed:', err);
  process.exit(1);
});
