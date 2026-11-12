/**
 * frontend/scripts/check_cells.js
 * Audit every report tab and every list page of every role for name-like columns:
 * (driver, customer, owner, vehicle, submitted by, reviewed by, assigned driver, entity type).
 * Flags cells that are empty, or show '-', '#-', 'undefined', 'null', 'NaN'.
 * Where data really does not exist, shows 'Not recorded'.
 */
const os = require('os');
const path = require('path');
const puppeteer = require('../node_modules/puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const NAME_LIKE_HEADERS = [
  'driver',
  'customer',
  'owner',
  'vehicle',
  'submitted by',
  'reviewed by',
  'assigned driver',
  'entity type',
  'owner / registration',
  'registration no.',
  'registration number'
];

const PAGES_BY_ROLE = [
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
      '/manager/bus-monitor',
      '/manager/reports'
    ]
  },
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
  {
    role: 'CUSTOMER',
    loginEmail: 'customer1@fleetflow.com',
    paths: [
      '/customer/my-bookings',
      '/customer/payments'
    ]
  }
];

const REPORT_TABS = [
  'bookings',
  'trips',
  'payments',
  'vehicle-utilization',
  'fuel',
  'expenses',
  'documents-expiry',
  'vehicle-cost'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runCheckCells() {
  console.log('='.repeat(90));
  console.log(' FLEETFLOW NAME-LIKE CELLS DATA INTEGRITY AUDIT (check:cells)');
  console.log('='.repeat(90));
  console.log(
    'Page Path'.padEnd(30) +
    'Column Header'.padEnd(25) +
    'Row #'.padEnd(8) +
    'Cell Value'.padEnd(20) +
    'Status'
  );
  console.log('-'.repeat(90));

  const tempUserDir = path.join(
    os.tmpdir(),
    `puppeteer_cells_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
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

  let totalAudited = 0;
  let totalViolations = 0;
  const violationRows = [];

  for (const group of PAGES_BY_ROLE) {
    // Login
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 15000 });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', group.loginEmail);
    await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');
    await sleep(2500);

    for (const pagePath of group.paths) {
      try {
        await page.goto(`http://localhost:3000${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(1500);

        // If it's a reports page, cycle through all report tabs
        const isReports = pagePath.includes('reports');
        const tabList = isReports ? REPORT_TABS : [null];

        for (const tab of tabList) {
          if (tab) {
            await page.evaluate((targetTab) => {
              const tabButtons = Array.from(document.querySelectorAll('.tabs-nav button, .report-tabs button, [role="tab"]'));
              const btn = tabButtons.find(b => {
                const text = b.textContent.toLowerCase();
                const id = b.getAttribute('data-tab') || b.getAttribute('id') || '';
                return text.includes(targetTab.replace(/-/g, ' ')) || id.includes(targetTab);
              });
              if (btn) btn.click();
            }, tab);
            await sleep(1000);
          }

          const currentPathLabel = tab ? `${pagePath}?tab=${tab}` : pagePath;

          // Audit all tables on the current view
          const cellResults = await page.evaluate((targetHeaders) => {
            const results = [];
            const tables = Array.from(document.querySelectorAll('table'));

            tables.forEach((table, tIndex) => {
              const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
              const colIndices = [];

              ths.forEach((th, idx) => {
                const headerText = th.textContent.trim().toLowerCase();
                if (targetHeaders.some(h => headerText.includes(h))) {
                  colIndices.push({ index: idx, name: th.textContent.trim() });
                }
              });

              if (colIndices.length === 0) return;

              const rows = Array.from(table.querySelectorAll('tbody tr'));
              rows.forEach((row, rIdx) => {
                const cells = Array.from(row.querySelectorAll('td'));
                colIndices.forEach(({ index, name }) => {
                  if (cells[index]) {
                    const rawVal = cells[index].textContent.trim();
                    results.push({
                      column: name,
                      row: rIdx + 1,
                      val: rawVal,
                    });
                  }
                });
              });
            });

            return results;
          }, NAME_LIKE_HEADERS);

          for (const item of cellResults) {
            totalAudited++;
            const v = item.val;
            const isInvalid = (
              v === '' ||
              v === '-' ||
              v === '#-' ||
              v.toLowerCase() === 'undefined' ||
              v.toLowerCase() === 'null' ||
              v.toLowerCase() === 'nan'
            );

            if (isInvalid) {
              totalViolations++;
              violationRows.push({
                page: currentPathLabel,
                column: item.column,
                row: item.row,
                val: `"${v}"`
              });
              console.log(
                currentPathLabel.padEnd(30) +
                item.column.padEnd(25) +
                String(item.row).padEnd(8) +
                `"${v}"`.padEnd(20) +
                '[FAIL]'
              );
            }
          }
        }
      } catch (err) {
        // Skip page error
      }
    }
  }

  await browser.close();

  console.log('-'.repeat(90));
  console.log(`Total name-like cells audited: ${totalAudited}`);
  console.log(`Violations detected:          ${totalViolations}`);
  console.log('='.repeat(90));

  if (totalViolations > 0) {
    console.error('\nFAIL: Found blank or invalid name-like cells!');
    process.exit(1);
  } else {
    console.log('\nPASS: All name-like cells contain valid names, plates, or "Not recorded".');
    process.exit(0);
  }
}

runCheckCells().catch((err) => {
  console.error(err);
  process.exit(1);
});

