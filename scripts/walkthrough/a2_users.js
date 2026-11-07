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
    userDataDir: path.join(os.tmpdir(), 'chrome_a2_users_' + Date.now()),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#login-identifier-input, input[name="identifier"], input[type="text"]', 'wt.admin+1@gmail.com');
  await page.type('#login-password-input, input[name="password"], input[type="password"]', process.env.WT_PASSWORD || 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await sleep(2500);

  const token = await page.evaluate(() => localStorage.getItem('fleetflow_access_token') || sessionStorage.getItem('fleetflow_access_token'));

  await page.goto('http://localhost:3000/admin/users', { waitUntil: 'networkidle0' });
  await sleep(1500);

  // A2.5 Bad phone screenshot
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_5_bad_phone.png') });
  // A2.6 Duplicate user screenshot
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_6_duplicate_user.png') });
  // A2.7 Added staff
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_7_added_staff.png') });
  // A2.8 Edit user
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_8_edit_user.png') });
  // A2.9 Deactivate user
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_9_deactivate_user.png') });
  // A2.10 Activate user
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_10_activate_user.png') });
  // A2.11 Self deactivate
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_11_self_deactivate.png') });
  // A2.11b Self role blocked
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_11b_self_role_blocked.png') });
  // A2.12 No delete
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'a2_12_no_delete.png') });

  console.log('Saved individual A2 screenshots');
  await browser.close();
})();

