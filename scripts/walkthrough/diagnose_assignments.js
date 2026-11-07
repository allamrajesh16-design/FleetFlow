const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const fs = require('fs');
const path = require('path');

const os = require('os');

(async () => {
  const tempUserDir = path.join(os.tmpdir(), `puppeteer_diag_${Date.now()}_${Math.random().toString(36).substring(2)}`);
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const logs = [];
  const reqs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('request', r => {
    if (r.url().includes('/api/')) {
      reqs.push({ url: r.url(), method: r.method(), startTime: Date.now(), status: null, duration: null });
    }
  });
  page.on('response', r => {
    const item = reqs.find(x => x.url === r.url() && x.status === null);
    if (item) {
      item.status = r.status();
      item.duration = Date.now() - item.startTime;
    }
  });

  console.log('Logging in as Fleet Manager...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]');
  await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', 'manager@fleetflow.com');
  await page.type('input[name="password"], #login-password-input, input[type="password"]', 'Walkthrough@123');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Navigating to /manager/assignments...');
  await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));

  const screenshotPath = path.join(__dirname, 'reproduce_assignments_stuck.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const pageDetails = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const isListLoading = bodyText.includes('Loading waiting items') || bodyText.includes('Loading...');
    const isRightLoading = bodyText.includes('Checking real-time vehicle and driver availability') || bodyText.includes('Loading assignable resources');
    const badgeText = document.querySelector('.assignments-count-badge')?.innerText || 'None';
    return { isListLoading, isRightLoading, badgeText, snippet: bodyText.substring(0, 500) };
  });

  console.log('--- REPRODUCE RESULTS ---');
  console.log('Page Details:', pageDetails);
  console.log('--- API REQUESTS (first 20) ---');
  console.log(JSON.stringify(reqs.slice(0, 20), null, 2));
  console.log('--- CONSOLE LOGS ---');
  console.log(logs.slice(-30).join('\n'));

  fs.writeFileSync(path.join(__dirname, 'evidence', 'part1_reproduce.json'), JSON.stringify({
    pageDetails,
    requests: reqs,
    logs,
    screenshotPath
  }, null, 2));

  await browser.close();
})();
