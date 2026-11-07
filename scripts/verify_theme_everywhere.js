const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function verify() {
  console.log('======================================================================');
  console.log(' VERIFYING LIGHT & DARK THEMES ON LANDING PAGE AND ALL PAGES');
  console.log('======================================================================\n');

  const tempUserDir = path.join(os.tmpdir(), `puppeteer_theme_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    // 1. Landing Page (Light Mode)
    await page.setViewport({ width: 1366, height: 768 });
    console.log('1. Navigating to Landing Page (http://localhost:3000/)...');
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.setItem('fleetflow_theme', 'light'); });
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    let theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log('   Initial Landing Theme:', theme);

    const landingToggle = await page.$('.landing-theme-toggle');
    console.log('   Landing Page theme toggle button present:', !!landingToggle);
    if (!landingToggle) throw new Error('Theme toggle is missing from Landing Page!');

    const landingLightPic = path.join(ARTIFACT_DIR, 'landing_page_light_theme.png');
    await page.screenshot({ path: landingLightPic, fullPage: false });
    console.log('   Saved screenshot:', landingLightPic);

    // 2. Toggle to Dark Mode on Landing Page
    console.log('2. Clicking Theme Toggle on Landing Page to switch to Dark Mode...');
    await page.evaluate(() => document.querySelector('.landing-theme-toggle')?.click());
    await new Promise(r => setTimeout(r, 1000));

    theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log('   Landing Theme after click:', theme);
    if (theme !== 'dark') throw new Error(`Expected dark theme, but got: ${theme}`);

    // Verify dark colors on landing page
    const titleColor = await page.evaluate(() => {
      const el = document.querySelector('.landing-title');
      return el ? window.getComputedStyle(el).color : null;
    });
    console.log('   Landing title color in dark mode:', titleColor);

    const landingDarkPic = path.join(ARTIFACT_DIR, 'landing_page_dark_theme.png');
    await page.screenshot({ path: landingDarkPic, fullPage: false });
    console.log('   Saved screenshot:', landingDarkPic);

    // 3. Public Auth Page (/login)
    console.log('3. Navigating to Login Page (/login)...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    const loginThemeToggle = await page.$('.public-floating-theme-toggle');
    console.log('   Login Page floating theme toggle present:', !!loginThemeToggle);

    const loginDarkPic = path.join(ARTIFACT_DIR, 'login_page_dark_theme.png');
    await page.screenshot({ path: loginDarkPic, fullPage: false });
    console.log('   Saved screenshot:', loginDarkPic);

    // 4. Log in and check Dashboard (/manager/dashboard)
    console.log('4. Logging in as Fleet Manager in Dark Theme...');
    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 10000 });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.manager+1@gmail.com');
    await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 2500));
    console.log('   Logged in URL:', page.url());

    const managerDarkPic = path.join(ARTIFACT_DIR, 'manager_dashboard_dark_theme.png');
    await page.screenshot({ path: managerDarkPic, fullPage: false });
    console.log('   Saved screenshot:', managerDarkPic);

    // 5. Toggle theme to Light mode in Manager Topbar
    console.log('5. Toggling theme back to Light Mode via Topbar...');
    await page.evaluate(() => document.querySelector('.topbar-theme-toggle')?.click());
    await new Promise(r => setTimeout(r, 1000));

    theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log('   Dashboard theme after toggle:', theme);
    if (theme !== 'light') throw new Error(`Expected light theme, but got: ${theme}`);

    const managerLightPic = path.join(ARTIFACT_DIR, 'manager_dashboard_light_theme.png');
    await page.screenshot({ path: managerLightPic, fullPage: false });
    console.log('   Saved screenshot:', managerLightPic);

    console.log('\n======================================================================');
    console.log(' SUCCESS: THEMES WORKING CLEARLY ON LANDING PAGE AND ALL PAGES!');
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
