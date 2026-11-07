const puppeteer = require('C:/Users/RAJESH/Desktop/FleetFlow/frontend/node_modules/puppeteer-core');

async function testVehicleSelect() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,768'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('#identifier', 'wt.customer+1@gmail.com');
  await page.type('#password', 'Walkthrough@2026!Sec');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  await page.goto('http://localhost:3000/customer/book', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'docs/screenshots/batch1b/cu3_vehicle_select_authenticated.png' });
  const cards = await page.evaluate(() => {
    const cardEls = document.querySelectorAll('.vehicle-card, .vehicle-select-card, [class*="vehicle"]');
    const imgs = Array.from(document.querySelectorAll('img')).map((i) => ({
      src: i.src,
      complete: i.complete,
      naturalWidth: i.naturalWidth,
      naturalHeight: i.naturalHeight,
    }));
    return { count: cardEls.length, imgs, text: document.body.innerText };
  });

  console.log('Images loaded on /customer/book:', cards.imgs);
  console.log('Cards found:', cards.count);
  await browser.close();
}

testVehicleSelect();

