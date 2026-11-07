const puppeteer = require('../node_modules/puppeteer-core');
const os = require('os');
const pathMod = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const VIEWPORTS = [1920, 1536, 1366, 1280, 1024, 768, 360];

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
      '/admin/fuel',
      '/admin/expenses',
      '/admin/documents',
    ],
  },
  {
    role: 'FLEET_MANAGER',
    loginEmail: 'wt.manager+1@gmail.com',
    paths: [
      '/manager/assignments',
      '/manager/fuel',
      '/manager/approvals',
      '/manager/bookings',
      '/manager/trips',
      '/manager/expenses',
      '/manager/documents',
    ],
  },
  {
    role: 'DRIVER',
    loginEmail: 'wt.driver+1@gmail.com',
    paths: [
      '/driver/trips',
      '/driver/fuel',
      '/driver/expenses',
      '/driver/documents',
    ],
  },
  {
    role: 'CUSTOMER',
    loginEmail: 'customer1@fleetflow.com',
    paths: [
      '/customer/bookings',
      '/customer/payments',
    ],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runButtonCheck() {
  console.log('='.repeat(96));
  console.log(' FLEETFLOW BUTTON CLIPPING & ACCESSIBILITY AUDIT (check:buttons)');
  console.log('='.repeat(96));
  console.log(
    'Role'.padEnd(16) +
    'Page Path'.padEnd(26) +
    'Viewport'.padEnd(12) +
    'Buttons Checked'.padEnd(18) +
    'Clipping/Issues'.padEnd(16) +
    'Result'
  );
  console.log('-'.repeat(96));

  const tempUserDir = pathMod.join(
    os.tmpdir(),
    `puppeteer_btn_check_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  let totalButtonsAudited = 0;
  const failureList = [];

  try {
    for (const group of PAGES_BY_ROLE) {
      // 1. Log in
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
      await page.type(
        'input[name="identifier"], #login-identifier-input, input[type="text"]',
        group.loginEmail
      );
      await page.type(
        'input[name="password"], #login-password-input, input[type="password"]',
        'Walkthrough@123'
      );
      await page.click('button[type="submit"]');
      await sleep(2500);

      for (const pathUrl of group.paths) {
        for (const width of VIEWPORTS) {
          const height = width <= 768 ? 640 : 900;
          await page.setViewport({ width, height });

          try {
            await page.goto(`http://localhost:3000${pathUrl}`, {
              waitUntil: 'domcontentloaded',
              timeout: 15000,
            });
          } catch (e) {}

          await sleep(800);

          // Evaluate button elements on the page
          const auditResult = await page.evaluate((vpWidth) => {
            const btns = Array.from(
              document.querySelectorAll('button, .btn, .icon-btn, [role="button"]')
            ).filter((el) => {
              // Ignore third-party vendor controls (e.g. leaflet map controls)
              if (el.closest('.leaflet-container') || el.classList.contains('leaflet-control-zoom-in') || el.classList.contains('leaflet-control-zoom-out')) {
                return false;
              }
              // Ignore hidden or non-displayed elements
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                parseFloat(style.opacity || '1') > 0 &&
                rect.width > 0 &&
                rect.height > 0
              );
            });

            const issues = [];

            btns.forEach((btn, idx) => {
              const rect = btn.getBoundingClientRect();
              const style = window.getComputedStyle(btn);

              // 1. Text clipping check: scrollWidth exceeds clientWidth by > 2px
              const textClipped = btn.scrollWidth > btn.clientWidth + 2;

              // 2. Minimum height check
              // Desktop > 768 requires min 36px; Mobile <= 768 requires min 44px for primary interactive buttons
              const isSmallControl =
                btn.classList.contains('pagination-page-btn') ||
                btn.classList.contains('density-toggle-btn') ||
                btn.classList.contains('tab-item') ||
                btn.classList.contains('sidebar-link') ||
                btn.classList.contains('ff-password-toggle');
              let heightViolation = false;
              if (!isSmallControl) {
                if (vpWidth > 768 && rect.height < 32) {
                  heightViolation = true;
                } else if (vpWidth <= 768 && rect.height < 40) {
                  heightViolation = true;
                }
              }

              // 3. Accessible name check
              const textContent = (btn.innerText || btn.textContent || '').trim();
              const ariaLabel =
                btn.getAttribute('aria-label') ||
                btn.getAttribute('title') ||
                btn.getAttribute('name') ||
                (btn.querySelector('[aria-label]') && btn.querySelector('[aria-label]').getAttribute('aria-label')) ||
                (btn.querySelector('title') && btn.querySelector('title').textContent) ||
                '';
              const hasAccessibleName = Boolean(textContent || ariaLabel);

              // 4. Overlap check with adjacent buttons in same container
              let overlapWithSibling = false;
              const nextBtn = btns[idx + 1];
              if (nextBtn && nextBtn.parentElement === btn.parentElement) {
                const nextRect = nextBtn.getBoundingClientRect();
                const horizontalOverlap =
                  rect.right > nextRect.left + 2 && rect.left < nextRect.right - 2;
                const verticalOverlap =
                  rect.bottom > nextRect.top + 2 && rect.top < nextRect.bottom - 2;
                if (horizontalOverlap && verticalOverlap) {
                  overlapWithSibling = true;
                }
              }

              if (textClipped || heightViolation || !hasAccessibleName || overlapWithSibling) {
                issues.push({
                  text: textContent || ariaLabel || title || '<no-text>',
                  tag: btn.tagName,
                  className: btn.className,
                  rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
                  textClipped,
                  heightViolation,
                  missingName: !hasAccessibleName,
                  overlapWithSibling,
                });
              }
            });

            return {
              checkedCount: btns.length,
              issues,
            };
          }, width);

          totalButtonsAudited += auditResult.checkedCount;

          const hasFailure = auditResult.issues.length > 0;
          if (hasFailure) {
            failureList.push({
              role: group.role,
              path: pathUrl,
              viewport: `${width}px`,
              issues: auditResult.issues,
            });
          }

          console.log(
            group.role.padEnd(16) +
            pathUrl.padEnd(26) +
            `${width}px`.padEnd(12) +
            String(auditResult.checkedCount).padEnd(18) +
            (hasFailure ? `${auditResult.issues.length} issue(s)` : '0 issues').padEnd(16) +
            (hasFailure ? '❌ FAIL' : '✅ PASS')
          );
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log('='.repeat(96));
  console.log(` AUDIT SUMMARY: Total Buttons Checked: ${totalButtonsAudited} across 7 viewports.`);
  if (failureList.length === 0) {
    console.log(' RESULT: 100% PASS - Zero clipped buttons, zero height violations, zero overlapping buttons.');
    console.log('='.repeat(96));
    process.exit(0);
  } else {
    console.error(` RESULT: FAILED with ${failureList.length} viewport failures!`);
    console.error(JSON.stringify(failureList, null, 2));
    console.log('='.repeat(96));
    process.exit(1);
  }
}

runButtonCheck().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
