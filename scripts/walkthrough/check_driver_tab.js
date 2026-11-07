const puppeteer = require('../../frontend/node_modules/puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 5000 });
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.driver+1@gmail.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  await page.goto('http://localhost:3000/driver/trips', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  const tabColors = await page.evaluate(() => {
    const activeBtn = document.querySelector('.driver-tab-button.active');
    if (!activeBtn) return null;
    const computed = window.getComputedStyle(activeBtn);
    return {
      classes: activeBtn.className,
      color: computed.color,
      background: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      text: activeBtn.innerText
    };
  });

  console.log('DRIVER ACTIVE TAB COMPUTED COLORS:\n', JSON.stringify(tabColors, null, 2));
  await browser.close();
})();

