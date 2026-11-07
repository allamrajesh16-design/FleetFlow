const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve('C:\\Users\\RAJESH\\.gemini\\antigravity-ide\\brain\\3b905b3b-76bf-45bd-a0ce-030b04f62ac2\\sticky_screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function testScrollSticky() {
  console.log('Launching Chrome for sticky scroll verification...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Test 1: 1366px, 1024px, 768px - scrolled to bottom
  const viewports = [
    { name: '1366', width: 1366, height: 700, dsf: 1 },
    { name: '1024', width: 1024, height: 700, dsf: 1 },
    { name: '768', width: 768, height: 900, dsf: 1 },
    // 125% zoom tests (deviceScaleFactor = 1.25)
    { name: '1366_zoom125', width: 1366, height: 768, dsf: 1.25 },
    { name: '1024_zoom125', width: 1024, height: 768, dsf: 1.25 },
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dsf });

    // --- REGISTER PAGE (Long Form: Select Driver to show additional fields) ---
    await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 600));

    // Select Driver role to make form even longer
    try {
      await page.select('select#role', 'DRIVER');
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {}

    // Scroll window to bottom
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(r => setTimeout(r, 500));

    const regFile = path.join(OUTPUT_DIR, `register_${vp.name}_scrolled.png`);
    await page.screenshot({ path: regFile });
    console.log(`Saved scrolled screenshot: ${regFile}`);

    // --- LOGIN PAGE ---
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 600));

    // Scroll window to bottom
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(r => setTimeout(r, 500));

    const loginFile = path.join(OUTPUT_DIR, `login_${vp.name}_scrolled.png`);
    await page.screenshot({ path: loginFile });
    console.log(`Saved scrolled screenshot: ${loginFile}`);
  }

  await browser.close();
  console.log('Sticky scroll verification complete!');
}

testScrollSticky().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
