const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function probeFocus() {
  const tempUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_probe_'));
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
    await page.goto('http://localhost:3000/profile', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('change password'));
      btn?.click();
    });

    await new Promise(r => setTimeout(r, 800));

    // Listen to focus and blur events inside modal
    await page.evaluate(() => {
      window.logs = [];
      document.addEventListener('focusin', (e) => {
        window.logs.push(`focusin: ${e.target.tagName}#${e.target.id}.${e.target.className}`);
      });
      document.addEventListener('focusout', (e) => {
        window.logs.push(`focusout: ${e.target.tagName}#${e.target.id}.${e.target.className}`);
      });
      document.addEventListener('mousedown', (e) => {
        window.logs.push(`mousedown: ${e.target.tagName}#${e.target.id}.${e.target.className}`);
      });
      document.addEventListener('mouseup', (e) => {
        window.logs.push(`mouseup: ${e.target.tagName}#${e.target.id}.${e.target.className}`);
      });
    });

    console.log('Typing 4 chars into #pwd-old...');
    await page.type('#pwd-old', 'test');

    console.log('Now clicking on #pwd-new...');
    await page.click('#pwd-new');
    await new Promise(r => setTimeout(r, 500));

    const events = await page.evaluate(() => {
      return {
        active: `${document.activeElement.tagName}#${document.activeElement.id}.${document.activeElement.className}`,
        logs: window.logs
      };
    });

    console.log('Active element:', events.active);
    console.log('Event trace:');
    events.logs.forEach(l => console.log('  ', l));

  } catch (err) {
    console.error('Probe error:', err);
  } finally {
    await browser.close();
    try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch {}
  }
}

probeFocus();
