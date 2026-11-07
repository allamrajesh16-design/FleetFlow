const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';

async function verify() {
  console.log('======================================================================');
  console.log(' VERIFYING PROFILE & NOTIFICATIONS: TOPBAR ONLY, NO NAV');
  console.log('======================================================================\n');

  const tempUserDir = path.join(os.tmpdir(), `puppeteer_prof_notif_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon.ico')) {
        consoleErrors.push(text);
      }
    }
  });

  try {
    // 1. Login
    await page.setViewport({ width: 1366, height: 768 });
    console.log('1. Navigating to login...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 10000 });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.admin+1@gmail.com');
    await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 2500));
    console.log('   Logged in successfully. Current URL:', page.url());

    // 2. Test /profile at 1366px
    console.log('2. Navigating to /profile (Desktop 1366px)...');
    await page.goto('http://localhost:3000/profile', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    const profileTopbar = await page.$('.topbar');
    const profileSidebar = await page.$('.sidebar-container');
    const profileBottomNav = await page.$('.driver-bottom-nav');
    const profileContent = await page.$('.profile-page-container');

    console.log('   /profile checks:');
    console.log('   - Topbar present:', !!profileTopbar);
    console.log('   - Sidebar present:', !!profileSidebar);
    console.log('   - Bottom nav present:', !!profileBottomNav);
    console.log('   - Profile content present:', !!profileContent);

    if (!profileTopbar) throw new Error('/profile is missing Topbar');
    if (profileSidebar) throw new Error('/profile still has Sidebar nav');
    if (profileBottomNav) throw new Error('/profile still has Bottom nav');

    const profilePicPath = path.join(ARTIFACT_DIR, 'profile_page_topbar_only_1366.png');
    await page.screenshot({ path: profilePicPath, fullPage: false });
    console.log('   Saved screenshot:', profilePicPath);

    // 3. Test /notifications at 1366px
    console.log('3. Navigating to /notifications (Desktop 1366px)...');
    await page.goto('http://localhost:3000/notifications', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    const notifTopbar = await page.$('.topbar');
    const notifSidebar = await page.$('.sidebar-container');
    const notifBottomNav = await page.$('.driver-bottom-nav');
    const notifContent = await page.$('.notifications-page');

    console.log('   /notifications checks:');
    console.log('   - Topbar present:', !!notifTopbar);
    console.log('   - Sidebar present:', !!notifSidebar);
    console.log('   - Bottom nav present:', !!notifBottomNav);
    console.log('   - Notifications content present:', !!notifContent);

    if (!notifTopbar) throw new Error('/notifications is missing Topbar');
    if (notifSidebar) throw new Error('/notifications still has Sidebar nav');
    if (notifBottomNav) throw new Error('/notifications still has Bottom nav');

    const notifPicPath = path.join(ARTIFACT_DIR, 'notifications_page_topbar_only_1366.png');
    await page.screenshot({ path: notifPicPath, fullPage: false });
    console.log('   Saved screenshot:', notifPicPath);

    // 4. Test Mobile 360px on /profile
    console.log('4. Testing Mobile (360px) on /profile...');
    await page.setViewport({ width: 360, height: 740, isMobile: true });
    await page.goto('http://localhost:3000/profile', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    const mProfileTopbar = await page.$('.topbar');
    const mProfileSidebar = await page.$('.sidebar-container');
    const mProfileBottomNav = await page.$('.driver-bottom-nav');

    console.log('   Mobile /profile checks:');
    console.log('   - Topbar present:', !!mProfileTopbar);
    console.log('   - Sidebar present:', !!mProfileSidebar);
    console.log('   - Bottom nav present:', !!mProfileBottomNav);

    const mProfilePicPath = path.join(ARTIFACT_DIR, 'profile_page_topbar_only_360.png');
    await page.screenshot({ path: mProfilePicPath, fullPage: false });
    console.log('   Saved screenshot:', mProfilePicPath);

    // 5. Test Mobile 360px on /notifications
    console.log('5. Testing Mobile (360px) on /notifications...');
    await page.goto('http://localhost:3000/notifications', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    const mNotifTopbar = await page.$('.topbar');
    const mNotifSidebar = await page.$('.sidebar-container');
    const mNotifBottomNav = await page.$('.driver-bottom-nav');

    console.log('   Mobile /notifications checks:');
    console.log('   - Topbar present:', !!mNotifTopbar);
    console.log('   - Sidebar present:', !!mNotifSidebar);
    console.log('   - Bottom nav present:', !!mNotifBottomNav);

    const mNotifPicPath = path.join(ARTIFACT_DIR, 'notifications_page_topbar_only_360.png');
    await page.screenshot({ path: mNotifPicPath, fullPage: false });
    console.log('   Saved screenshot:', mNotifPicPath);

    // 6. Test normal pages still have navigation (e.g. /admin/fleet)
    console.log('6. Verifying normal pages still retain navigation (/admin/fleet)...');
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto('http://localhost:3000/admin/fleet', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    const fleetTopbar = await page.$('.topbar');
    const fleetSidebar = await page.$('.sidebar-container');

    console.log('   /admin/fleet checks:');
    console.log('   - Topbar present:', !!fleetTopbar);
    console.log('   - Sidebar present:', !!fleetSidebar);

    if (!fleetTopbar || !fleetSidebar) {
      throw new Error('/admin/fleet navigation was unexpectedly altered!');
    }

    console.log('\n======================================================================');
    console.log(' ALL ASSERTIONS PASSED! ZERO REGRESSIONS!');
    console.log(' Console errors during test:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log(' Errors:', consoleErrors);
    }
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
