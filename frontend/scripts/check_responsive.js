const path = require('path');
const puppeteer = require('../node_modules/puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { name: 'phone_360', width: 360, height: 800 },
  { name: 'phone_390', width: 390, height: 844 },
  { name: 'phone_414', width: 414, height: 896 },
  { name: 'tablet_768', width: 768, height: 1024 },
  { name: 'tablet_1024', width: 1024, height: 768 },
  { name: 'desktop_1280', width: 1280, height: 720 },
  { name: 'desktop_1366', width: 1366, height: 768 },
  { name: 'desktop_1536', width: 1536, height: 864 },
  { name: 'desktop_1920', width: 1920, height: 1080 },
];

async function run() {
  console.log('='.repeat(80));
  console.log(' RUNNING RESPONSIVE VIEWPORT SUITE ACROSS 9 STANDARD DEVICES');
  console.log('='.repeat(80));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    pipe: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  let failures = 0;

  // Login as manager
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'manager@fleetflow.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Demo@12345');
  await page.click('button[type="submit"]');
  await sleep(2000);

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'networkidle2' });
    await sleep(800);

    const res = await page.evaluate(() => {
      const doc = document.documentElement;
      const scrollWidth = doc.scrollWidth;
      const clientWidth = doc.clientWidth;
      const hasHorizontalScroll = scrollWidth > clientWidth + 1;
      const layouts = document.querySelectorAll('[data-layout]').length;
      const actionTextButtons = Array.from(document.querySelectorAll('button')).filter(
        b => b.innerText.trim() === 'Action'
      ).length;

      return {
        hasHorizontalScroll,
        scrollWidth,
        clientWidth,
        layouts,
        actionTextButtons
      };
    });

    if (res.hasHorizontalScroll || res.layouts !== 1 || res.actionTextButtons > 0) {
      failures++;
      console.error(`❌ [${vp.name}] Failed: scroll=${res.clientWidth}/${res.scrollWidth}, layouts=${res.layouts}, actionBtns=${res.actionTextButtons}`);
    } else {
      console.log(`✅ [${vp.name}] (${vp.width}x${vp.height}): Zero overflow, single layout root, zero "Action" text`);
    }
  }

  await browser.close();

  if (failures > 0) {
    console.error(`\nFAILED with ${failures} viewport failures.`);
    process.exit(1);
  } else {
    console.log('\nALL 9 VIEWPORT TESTS PASSED SUCCESSFULLY.');
    process.exit(0);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

