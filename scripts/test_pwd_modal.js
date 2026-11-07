const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testPasswordModal() {
  const tempUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_test_pwd_'));
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--remote-debugging-port=0']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#identifier, input[type="text"]', { timeout: 10000 });
    await page.type('#identifier, input[type="text"]', 'wt.demo.s1.cust@gmail.com');
    await page.type('#password, input[type="password"]', 'Walkthrough@123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 2500));
    console.log('Logged in. Navigating to /profile...');
    await page.goto('http://localhost:3000/profile', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // Find and click Change Password button
    console.log('Clicking Change Password button...');
    const btn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const pwdBtn = buttons.find(b => b.textContent.toLowerCase().includes('change password'));
      if (pwdBtn) {
        pwdBtn.click();
        return true;
      }
      return false;
    });
    console.log('Change Password button found & clicked:', btn);

    await new Promise(r => setTimeout(r, 1000));

    // Type in pwd-old
    await page.type('#pwd-old', 'OldPass123!');
    console.log('Typed in #pwd-old');

    // Check active element before clicking pwd-new
    let activeId = await page.evaluate(() => document.activeElement?.id);
    console.log('Active element after typing in pwd-old:', activeId);

    // Now click #pwd-new
    console.log('Clicking on #pwd-new...');
    await page.click('#pwd-new');
    await new Promise(r => setTimeout(r, 500));

    activeId = await page.evaluate(() => document.activeElement?.id);
    console.log('Active element after clicking #pwd-new:', activeId);

    // Try typing in #pwd-new
    await page.type('#pwd-new', 'NewPass123!');
    const valNew = await page.evaluate(() => document.querySelector('#pwd-new')?.value);
    console.log('Value of #pwd-new:', valNew);

    // Let's inspect elements covering #pwd-new or z-indexes
    const info = await page.evaluate(() => {
      const el = document.querySelector('#pwd-new');
      if (!el) return 'el not found';
      const rect = el.getBoundingClientRect();
      const topEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        elementFromCenter: topEl ? `${topEl.tagName}.${topEl.className} id=${topEl.id}` : 'none'
      };
    });
    console.log('Element from point info for #pwd-new:', info);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
    try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch {}
  }
}

testPasswordModal();
