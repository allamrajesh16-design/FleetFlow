const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function verify() {
  console.log('======================================================================');
  console.log(' VERIFYING SIDEBAR: NOTIFICATIONS & PROFILE REMOVED FROM NAV BAR');
  console.log('======================================================================\n');

  const tempUserDir = path.join(os.tmpdir(), `puppeteer_sidebar_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    // 1. Login as Fleet Manager
    await page.setViewport({ width: 1366, height: 768 });
    console.log('1. Logging in as Fleet Manager (wt.manager+1@gmail.com)...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 10000 });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.manager+1@gmail.com');
    await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 2500));
    console.log('   Logged in. Current URL:', page.url());

    // 2. Navigate to /manager/reports (the exact page in the user photo)
    console.log('2. Navigating to /manager/reports...');
    await page.goto('http://localhost:3000/manager/reports', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // Get all sidebar nav links
    const sidebarItems = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.sidebar-nav a, .sidebar-container a, .nav-item'));
      return links.map(el => el.innerText.trim()).filter(Boolean);
    });
    console.log('   Sidebar items found:\n  ', sidebarItems.join('\n   '));

    const hasNotif = sidebarItems.some(item => item.toLowerCase().includes('notification'));
    const hasProfile = sidebarItems.some(item => item.toLowerCase().includes('profile'));

    console.log('\n   - Has Notifications in sidebar:', hasNotif);
    console.log('   - Has Profile in sidebar:', hasProfile);

    // Check topbar has Notifications and Profile
    const topbarNotif = await page.$('.topbar a[href*="notification"], .topbar [aria-label*="Notification"]');
    const topbarUser = await page.$('.topbar-user-wrapper, .topbar-user-btn, .topbar-avatar');

    console.log('   - Has Notifications in Topbar:', !!topbarNotif);
    console.log('   - Has Profile in Topbar:', !!topbarUser);

    if (hasNotif) throw new Error('Notifications is still present in the sidebar nav bar!');
    if (hasProfile) throw new Error('Profile is still present in the sidebar nav bar!');
    if (!topbarNotif) throw new Error('Notifications is missing from Topbar!');
    if (!topbarUser) throw new Error('Profile is missing from Topbar!');

    // Capture screenshot matching user's photo
    const picPath = path.join(ARTIFACT_DIR, 'manager_reports_clean_sidebar.png');
    await page.screenshot({ path: picPath, fullPage: false });
    console.log('\n   Saved clean screenshot:', picPath);

    console.log('\n======================================================================');
    console.log(' SUCCESS: NOTIFICATIONS & PROFILE REMOVED FROM NAV BAR CLEANLY!');
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
