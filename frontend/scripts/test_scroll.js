const puppeteer = require('../node_modules/puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost:3000/login');
  await page.type('input[type="text"]', 'wt.admin+1@gmail.com');
  await page.type('input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));
  await page.goto('http://localhost:3000/admin/expenses');
  await new Promise(r => setTimeout(r, 1500));

  const ancestors = await page.evaluate(() => {
    let el = document.querySelector('.topbar');
    const chain = [];
    while (el) {
      const s = window.getComputedStyle(el);
      chain.push({
        tag: el.tagName,
        className: el.className,
        overflow: s.overflow,
        overflowX: s.overflowX,
        overflowY: s.overflowY,
        position: s.position,
        height: s.height
      });
      el = el.parentElement;
    }
    return chain;
  });

  console.log('ANCESTOR CHAIN:', JSON.stringify(ancestors, null, 2));
  await browser.close();
})();
