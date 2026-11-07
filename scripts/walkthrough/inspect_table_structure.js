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

  const tableDump = await page.evaluate(() => {
    const table = document.querySelector('table');
    const theadTr = document.querySelector('table thead tr:first-child');
    const tbodyTr = document.querySelector('table tbody tr:first-child');
    return {
      tableTag: table ? table.tagName : null,
      tableLayout: table ? window.getComputedStyle(table).tableLayout : null,
      theadTrDisplay: theadTr ? window.getComputedStyle(theadTr).display : null,
      tbodyTrDisplay: tbodyTr ? window.getComputedStyle(tbodyTr).display : null,
      theadTrPosition: theadTr ? window.getComputedStyle(theadTr).position : null,
      tbodyTrPosition: tbodyTr ? window.getComputedStyle(tbodyTr).position : null,
      theadChildren: theadTr ? Array.from(theadTr.children).map(c => ({ tag: c.tagName, text: c.innerText.trim(), left: c.getBoundingClientRect().left, width: c.getBoundingClientRect().width })) : [],
      tbodyChildren: tbodyTr ? Array.from(tbodyTr.children).map(c => ({ tag: c.tagName, text: c.innerText.trim(), left: c.getBoundingClientRect().left, width: c.getBoundingClientRect().width })) : [],
      hasPseudoOnTr: tbodyTr ? window.getComputedStyle(tbodyTr, '::before').content : null
    };
  });

  console.log('TABLE DUMP:\n', JSON.stringify(tableDump, null, 2));
  await browser.close();
})();
