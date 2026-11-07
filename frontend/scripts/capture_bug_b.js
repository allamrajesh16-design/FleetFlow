const puppeteer = require('puppeteer-core');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  // Inject auth via sessionStorage and localStorage
  await page.goto('http://localhost:3000/login');
  await page.evaluate(() => {
    const dummyUser = {
      id: 10,
      full_name: 'WT-Customer One',
      email: 'wt.customer+1@gmail.com',
      role: 'CUSTOMER',
      approval_status: 'APPROVED',
      is_email_verified: true,
    };
    sessionStorage.setItem('fleetflow_user', JSON.stringify(dummyUser));
    sessionStorage.setItem('fleetflow_access_token', 'mock_token');
    localStorage.setItem('fleetflow_remember', 'true');
    localStorage.setItem('fleetflow_user', JSON.stringify(dummyUser));
    localStorage.setItem('fleetflow_access_token', 'mock_token');
    localStorage.setItem('fleetflow_last_active', Date.now().toString());
  });
  
  // Navigate to book vehicle
  await page.goto('http://localhost:3000/customer/book/vehicle?type=CAR', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#distance-input', { timeout: 10000 });
  await sleep(1000);
  
  // Screenshot without distance
  const noDistPath = path.resolve(__dirname, '../../docs/guide/images/customer/bug_b_no_distance.png');
  await page.screenshot({ path: noDistPath });
  console.log('Saved', noDistPath);
  
  // Type 50 km distance
  await page.type('#distance-input', '50');
  await sleep(1000);
  const estPath = path.resolve(__dirname, '../../docs/guide/images/customer/bug_b_lowest_rate_estimate.png');
  await page.screenshot({ path: estPath });
  console.log('Saved', estPath);

  await browser.close();
})();

