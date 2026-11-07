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
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'wt.admin+1@gmail.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  await page.goto('http://localhost:3000/admin/drivers', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  const diag = await page.evaluate(() => {
    const theadTh0 = document.querySelector('table thead th:first-child');
    const tbodyTd0 = document.querySelector('table tbody tr:first-child td:first-child');
    const beforeDiff = tbodyTd0.getBoundingClientRect().left - theadTh0.getBoundingClientRect().left;

    // Test removing ::before on .datatable-tr
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .datatable-tr { position: static !important; }
      .datatable-tr::before { display: none !important; }
    `;
    document.head.appendChild(styleEl);

    const afterDiff = tbodyTd0.getBoundingClientRect().left - theadTh0.getBoundingClientRect().left;
    return {
      beforeDiff,
      afterDiff,
      th0Left: theadTh0.getBoundingClientRect().left,
      td0Left: tbodyTd0.getBoundingClientRect().left
    };
  });

  console.log('DIAGNOSIS RESULT:\n', JSON.stringify(diag, null, 2));
  await browser.close();
})();

