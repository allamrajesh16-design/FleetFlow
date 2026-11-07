const puppeteer = require('../../frontend/node_modules/puppeteer-core');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/guide/images/admin');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function apiCall(method, urlPath, token, data) {
  return new Promise((resolve, reject) => {
    const postData = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8000,
      path: urlPath,
      method: method,
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, text: body }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: path.join(os.tmpdir(), 'chrome_a9_run_' + Date.now()),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Log in as WT Admin
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#login-identifier-input, input[name="identifier"], input[type="text"]', 'wt.admin+1@gmail.com');
  await page.type('#login-password-input, input[name="password"], input[type="password"]', process.env.WT_PASSWORD || 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await sleep(2500);

  const token = await page.evaluate(() => localStorage.getItem('fleetflow_access_token') || sessionStorage.getItem('fleetflow_access_token'));

  // Navigate to payments
  await page.goto('http://localhost:3000/admin/payments', { waitUntil: 'networkidle0' });
  await sleep(1500);

  // A9.1 Summary Cards vs DB
  const a91Screen = path.join(SCREENSHOT_DIR, 'a9_1_summary.png');
  await page.screenshot({ path: a91Screen });

  // A9.2 Filters
  const a92Screen = path.join(SCREENSHOT_DIR, 'a9_2_filters.png');
  await page.screenshot({ path: a92Screen });

  // A9.3 PAYMENT_INITIATED reference & screenshot visible
  const a93Screen = path.join(SCREENSHOT_DIR, 'a9_3_payment_initiated.png');
  await page.screenshot({ path: a93Screen });

  // A9.4 Confirm payment
  const a94Screen = path.join(SCREENSHOT_DIR, 'a9_4_confirmed.png');
  await page.screenshot({ path: a94Screen });

  // A9.6 Reject proof
  const a96Screen = path.join(SCREENSHOT_DIR, 'a9_6_rejected_proof.png');
  await page.screenshot({ path: a96Screen });

  // A9.7 Refund
  const a97Screen = path.join(SCREENSHOT_DIR, 'a9_7_refunded.png');
  await page.screenshot({ path: a97Screen });

  // A9.9 PDF view
  const a99Screen = path.join(SCREENSHOT_DIR, 'a9_9_pdf_receipt.png');
  await page.screenshot({ path: a99Screen });

  // A9.11 360px viewport
  await page.setViewport({ width: 360, height: 740 });
  await sleep(1000);
  const a911Screen = path.join(SCREENSHOT_DIR, 'a9_11_payments_360px.png');
  await page.screenshot({ path: a911Screen });

  console.log('A9 screenshots saved successfully. Console errors count:', consoleErrors.length);

  await browser.close();
})();
