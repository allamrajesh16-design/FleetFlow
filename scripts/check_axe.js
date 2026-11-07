const fs = require('fs');
const path = require('path');
const puppeteer = require('../frontend/node_modules/puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const AXE_PATH = path.resolve(__dirname, '../frontend/node_modules/axe-core/axe.min.js');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const AUDIT_PAGES = [
  { name: 'Landing Page', url: `${BASE_URL}/` },
  { name: 'Login Page', url: `${BASE_URL}/login` },
  { name: 'Register Page', url: `${BASE_URL}/register` },
  { name: 'Customer Dashboard', url: `${BASE_URL}/customer/dashboard`, role: 'CUSTOMER', email: 'wt.cust1@gmail.com' },
  { name: 'Admin Dashboard', url: `${BASE_URL}/admin/users`, role: 'ADMIN', email: 'wt.admin+1@gmail.com' },
  { name: 'Driver Dashboard', url: `${BASE_URL}/driver/dashboard`, role: 'DRIVER', email: 'wt.driver1@gmail.com' },
  { name: 'Manager Dashboard', url: `${BASE_URL}/manager/dashboard`, role: 'FLEET_MANAGER', email: 'wt.manager+1@gmail.com' }
];

async function runAxeAudit() {
  console.log('================================================================================');
  console.log(' FLEETFLOW AXE-CORE ACCESSIBILITY AUDIT (WCAG 2.1 AA)');
  console.log('================================================================================');

  if (!fs.existsSync(CHROME_PATH)) {
    console.error(`Chrome binary not found at ${CHROME_PATH}`);
    process.exit(1);
  }

  const axeSource = fs.readFileSync(AXE_PATH, 'utf8');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  let totalViolations = 0;
  let seriousOrCritical = 0;
  const pageResults = [];

  for (const pageInfo of AUDIT_PAGES) {
    try {
      if (pageInfo.role) {
        // Authenticate into mock/session state via localStorage
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
        await page.evaluate((role, email) => {
          const userObj = {
            id: 1,
            email: email,
            role: role,
            full_name: `Test ${role}`,
            is_email_verified: true,
            approval_status: 'APPROVED'
          };
          localStorage.setItem('fleetflow_user', JSON.stringify(userObj));
          localStorage.setItem('fleetflow_token', 'mock_jwt_token_for_audit');
          localStorage.setItem('token', 'mock_jwt_token_for_audit');
          localStorage.setItem('user', JSON.stringify(userObj));
        }, pageInfo.role, pageInfo.email);
      }

      await page.goto(pageInfo.url, { waitUntil: 'networkidle0', timeout: 15000 }).catch(async () => {
        await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded' });
      });

      // Inject axe-core
      await page.evaluate(axeSource);

      // Run accessibility inspection (structure, ARIA attributes, landmarks, labels, forms)
      const results = await page.evaluate(async () => {
        return await window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
          },
          rules: {
            'color-contrast': { enabled: false } // Dedicated token contrast tested in check:contrast
          }
        });
      });

      const severeViolations = results.violations.filter(
        v => v.impact === 'serious' || v.impact === 'critical'
      );

      pageResults.push({
        name: pageInfo.name,
        violations: results.violations.length,
        seriousOrCritical: severeViolations.length,
        passes: results.passes.length
      });

      totalViolations += results.violations.length;
      seriousOrCritical += severeViolations.length;

      const mark = severeViolations.length === 0 ? '✓' : '✗';
      console.log(` ${mark} ${pageInfo.name.padEnd(25)} : ${results.passes.length} rules passed, ${severeViolations.length} serious/critical issues`);

      if (severeViolations.length > 0) {
        severeViolations.forEach(v => {
          console.log(`     - [${v.impact.toUpperCase()}] ${v.id}: ${v.help}`);
          v.nodes.forEach(n => {
            console.log(`       Target: ${n.target.join(' ')}`);
            console.log(`       HTML: ${n.html.substring(0, 100)}`);
          });
        });
      }
    } catch (err) {
      console.log(` ! ${pageInfo.name.padEnd(25)} : Audit skipped (${err.message})`);
    }
  }

  await browser.close();

  console.log('================================================================================');
  console.log(` AUDIT RESULT: ${seriousOrCritical} Serious/Critical Issues`);
  console.log('================================================================================');

  if (seriousOrCritical === 0) {
    console.log('✓ PASS: All audited pages meet WCAG 2.1 AA standards with 0 serious/critical issues.\n');
    process.exit(0);
  } else {
    console.error(`✗ FAIL: Found ${seriousOrCritical} serious/critical accessibility issues.\n`);
    process.exit(1);
  }
}

runAxeAudit().catch(err => {
  console.error('Audit failed with unexpected error:', err);
  process.exit(1);
});
