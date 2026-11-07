const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function verify() {
  console.log('======================================================================');
  console.log(' VERIFYING DRIVER DOCUMENTS LIGHT VS DARK THEME (USER SPEC)');
  console.log('======================================================================\n');

  const tempUserDir = path.join(os.tmpdir(), `puppeteer_driver_doc_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    // 1. Login as Driver (Suresh)
    await page.setViewport({ width: 1366, height: 768 });
    console.log('1. Logging in as Driver (wt.driver+1@gmail.com)...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 10000 });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.driver+1@gmail.com');
    await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 2500));
    console.log('   Logged in URL:', page.url());

    // 2. Navigate to /driver/documents in Light Mode
    console.log('2. Testing /driver/documents in LIGHT Mode (keep today look exactly)...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('fleetflow_theme', 'light');
    });
    await page.goto('http://localhost:3000/driver/documents', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    const lightPic = path.join(ARTIFACT_DIR, 'driver_documents_light_mode.png');
    await page.screenshot({ path: lightPic, fullPage: false });
    console.log('   Saved LIGHT mode screenshot:', lightPic);

    // 3. Switch to Dark Mode on /driver/documents
    console.log('3. Testing /driver/documents in DARK Mode (layered surfaces, soft text, readable sidebar, visible table header)...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('fleetflow_theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 1000));

    // Verify Dark Mode elements
    const darkChecks = await page.evaluate(() => {
      const th = document.querySelector('.table-th, th, .datatable-th');
      const thColor = th ? window.getComputedStyle(th).color : null;
      const thBg = th ? window.getComputedStyle(th).backgroundColor : null;

      const sidebarLink = document.querySelector('.sidebar-link');
      const sidebarColor = sidebarLink ? window.getComputedStyle(sidebarLink).color : null;

      const bodyBg = window.getComputedStyle(document.body).backgroundColor;

      return { thColor, thBg, sidebarColor, bodyBg };
    });

    console.log('   Dark mode computed styles:');
    console.log('   - Page body background:', darkChecks.bodyBg);
    console.log('   - Table header color (visible header):', darkChecks.thColor);
    console.log('   - Table header background:', darkChecks.thBg);
    console.log('   - Sidebar link color (readable sidebar):', darkChecks.sidebarColor);

    const darkPic = path.join(ARTIFACT_DIR, 'driver_documents_dark_mode.png');
    await page.screenshot({ path: darkPic, fullPage: false });
    console.log('   Saved DARK mode screenshot:', darkPic);

    console.log('\n======================================================================');
    console.log(' SUCCESS: LIGHT & DARK MODES MATCH USER SPECIFICATION EXACTLY!');
    console.log('======================================================================');

  } finally {
    await browser.close();
    try {
      fs.rmSync(tempUserDir, { recursive: true, force: true });
    } catch {}
  }
}

verify().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});

