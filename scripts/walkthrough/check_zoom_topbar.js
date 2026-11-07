const puppeteer = require('../../frontend/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ZOOM_DIR = path.resolve(__dirname, '../../docs/guide/images/zoom');
if (!fs.existsSync(ZOOM_DIR)) fs.mkdirSync(ZOOM_DIR, { recursive: true });

// Viewports corresponding to 100%, 125%, 150%, 175%, 200%, 250%, 300% on 1920px screen
const ZOOM_WIDTHS = [1920, 1536, 1280, 1097, 960, 768, 640];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();

  // Test Driver Trips
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 5000 });
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.driver+1@gmail.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  for (const w of ZOOM_WIDTHS) {
    await page.setViewport({ width: w, height: 900 });
    await page.goto('http://localhost:3000/driver/trips', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    const check = await page.evaluate((width) => {
      const topbar = document.querySelector('.topbar') || document.querySelector('.driver-header');
      const sidebar = document.querySelector('.sidebar-container');
      const userChip = document.querySelector('.topbar-user-btn') || document.querySelector('.driver-header-right');
      const bell = document.querySelector('.topbar-bell-btn') || document.querySelector('a[href*="notifications"]');

      return {
        width,
        topbarPresent: !!topbar,
        topbarTop: topbar ? Math.round(topbar.getBoundingClientRect().top) : null,
        topbarHeight: topbar ? Math.round(topbar.getBoundingClientRect().height) : null,
        sidebarPresent: !!sidebar,
        sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
        userChipPresent: !!userChip,
        bellPresent: !!bell,
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth
      };
    }, w);

    console.log(`Width ${w}px result:`, JSON.stringify(check));
    await page.screenshot({ path: path.join(ZOOM_DIR, `driver_trips_${w}px.png`) });
  }

  await browser.close();
})();

