const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('C:/Users/RAJESH/Desktop/FleetFlow/frontend/node_modules/ws');

const SCREENSHOT_DIR = 'C:/Users/RAJESH/Desktop/FleetFlow/docs/screenshots/colors/after';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getWsUrl(port) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + port + '/json', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const list = JSON.parse(data);
        const page = list.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) resolve(page.webSocketDebuggerUrl);
        else reject(new Error('No page target'));
      });
    }).on('error', reject);
  });
}

async function capture() {
  const port = 9555;
  const chrome = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless=new',
      '--remote-debugging-port=' + port,
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1366,900',
      'http://localhost:3000'
    ]
  );
  await delay(2000);
  const wsUrl = await getWsUrl(port);
  const ws = new WebSocket(wsUrl);

  let id = 1;
  const callbacks = new Map();
  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      cb(msg.result, msg.error);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const curId = id++;
    callbacks.set(curId, (res, err) => err ? reject(err) : resolve(res));
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('DOM.enable');

  async function take(url, filename, width = 1366, height = 900, prepFn = null) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600
    });
    if (prepFn) {
      await send('Runtime.evaluate', { expression: '(' + prepFn.toString() + ')()' });
    }
    await send('Page.navigate', { url });
    await delay(1200);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, filename), Buffer.from(snap.data, 'base64'));
    console.log('Saved:', filename);
  }

  // 1. Admin Dashboard
  await take('http://localhost:3000/admin/dashboard', 'admin_dashboard_1366.png', 1366, 900, () => {
    localStorage.setItem('fleetflow_remember', 'true');
    localStorage.setItem('fleetflow_user', JSON.stringify({ id: 1, role: 'ADMIN', full_name: 'Admin User', email: 'admin@fleetflow.com' }));
    localStorage.setItem('fleetflow_access_token', 'mock_token');
    localStorage.setItem('fleetflow_last_active', String(Date.now()));
  });
  await take('http://localhost:3000/admin/dashboard', 'admin_dashboard_360.png', 360, 740);

  // 2. Manager Dashboard
  await take('http://localhost:3000/manager/dashboard', 'manager_dashboard_1366.png', 1366, 900, () => {
    localStorage.setItem('fleetflow_remember', 'true');
    localStorage.setItem('fleetflow_user', JSON.stringify({ id: 2, role: 'FLEET_MANAGER', full_name: 'Manager User', email: 'manager@fleetflow.com' }));
    localStorage.setItem('fleetflow_access_token', 'mock_token');
    localStorage.setItem('fleetflow_last_active', String(Date.now()));
  });
  await take('http://localhost:3000/manager/dashboard', 'manager_dashboard_360.png', 360, 740);

  // 3. Driver Dashboard
  await take('http://localhost:3000/driver/dashboard', 'driver_dashboard_1366.png', 1366, 900, () => {
    localStorage.setItem('fleetflow_remember', 'true');
    localStorage.setItem('fleetflow_user', JSON.stringify({ id: 3, role: 'DRIVER', full_name: 'Driver User', email: 'driver@fleetflow.com' }));
    localStorage.setItem('fleetflow_access_token', 'mock_token');
    localStorage.setItem('fleetflow_last_active', String(Date.now()));
  });
  await take('http://localhost:3000/driver/dashboard', 'driver_dashboard_360.png', 360, 740);

  // 4. Customer Dashboard
  await take('http://localhost:3000/customer/dashboard', 'customer_dashboard_1366.png', 1366, 900, () => {
    localStorage.setItem('fleetflow_remember', 'true');
    localStorage.setItem('fleetflow_user', JSON.stringify({ id: 4, role: 'CUSTOMER', full_name: 'Customer User', email: 'customer@fleetflow.com' }));
    localStorage.setItem('fleetflow_access_token', 'mock_token');
    localStorage.setItem('fleetflow_last_active', String(Date.now()));
  });
  await take('http://localhost:3000/customer/dashboard', 'customer_dashboard_360.png', 360, 740);

  // 5. Primary Buttons (e.g. Login page & Landing page hero CTA)
  await take('http://localhost:3000/login', 'primary_buttons_login_1366.png', 1366, 900);
  await take('http://localhost:3000/login', 'primary_buttons_login_360.png', 360, 740);
  await take('http://localhost:3000/', 'primary_buttons_landing_1366.png', 1366, 900);
  await take('http://localhost:3000/', 'primary_buttons_landing_360.png', 360, 740);

  ws.close();
  chrome.kill();
  console.log('FOCUSED AFTER SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

capture().catch(e => {
  console.error('Capture error:', e);
  process.exit(1);
});

