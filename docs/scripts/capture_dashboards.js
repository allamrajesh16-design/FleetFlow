const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('C:/Users/RAJESH/Desktop/FleetFlow/frontend/node_modules/ws');

const SCREENSHOTS_DIR = 'C:/Users/RAJESH/Desktop/FleetFlow/docs/screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function getWsUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const list = JSON.parse(data);
        const page = list.find((t) => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          resolve(page.webSocketDebuggerUrl);
        } else {
          reject(new Error('No page target found'));
        }
      });
    }).on('error', reject);
  });
}

async function captureScreen(role, email, widths) {
  console.log(`Starting capture for role ${role} (${email})...`);
  const chrome = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1366,900',
      'http://localhost:3000/login',
    ]
  );

  await new Promise((r) => setTimeout(r, 2000));
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);

  let id = 1;
  const callbacks = new Map();
  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const curId = id++;
      callbacks.set(curId, resolve);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  };

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      cb(msg.result);
    }
  });

  await new Promise((resolve) => ws.on('open', resolve));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Navigate to login
  await send('Page.navigate', { url: 'http://localhost:3000/login' });
  await new Promise((r) => setTimeout(r, 1500));

  // Perform login
  const loginScript = `
    (async () => {
      const emailInput = document.querySelector('#identifier');
      const passInput = document.querySelector('#password');
      const submitBtn = document.querySelector('button[type="submit"]');
      if (!emailInput || !passInput || !submitBtn) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(emailInput, '${email}');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(passInput, 'Demo@12345');
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      submitBtn.click();
      return true;
    })()
  `;
  await send('Runtime.evaluate', { expression: loginScript, awaitPromise: true });
  await new Promise((r) => setTimeout(r, 3000));

  // Capture at each width
  for (const w of widths) {
    const isMobile = w <= 768;
    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: 900,
      deviceScaleFactor: 1,
      mobile: isMobile,
    });
    await new Promise((r) => setTimeout(r, 1000));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.data) {
      const filename = path.join(SCREENSHOTS_DIR, `${role.toLowerCase()}_${w}px.png`);
      fs.writeFileSync(filename, Buffer.from(shot.data, 'base64'));
      console.log(`Saved screenshot: ${filename}`);
    }
  }

  ws.close();
  chrome.kill();
  await new Promise((r) => setTimeout(r, 1500));
}

async function main() {
  const widths = [1366, 1024, 768, 360];
  await captureScreen('Manager', 'manager@fleetflow.com', widths);
  await captureScreen('Admin', 'admin@fleetflow.com', widths);
  await captureScreen('Customer', 'customer1@fleetflow.com', [1366, 360]);
  await captureScreen('Driver', 'driver1@fleetflow.com', [360, 480]);
  console.log('All screenshots captured successfully!');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
