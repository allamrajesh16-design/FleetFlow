const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('C:/Users/RAJESH/Desktop/FleetFlow/frontend/node_modules/ws');

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

async function run() {
  console.log('Launching headless Chrome on port 9222...');
  const chrome = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--disable-gpu',
      '--no-sandbox',
      'http://localhost:3000',
    ]
  );

  await new Promise((r) => setTimeout(r, 2500));

  let wsUrl;
  try {
    wsUrl = await getWsUrl();
  } catch (err) {
    console.error('Failed to get WS url:', err.message);
    chrome.kill();
    return;
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const send = (method, params = {}) => {
    const curId = id++;
    ws.send(JSON.stringify({ id: curId, method, params }));
  };

  ws.on('open', () => {
    console.log('Connected to Chrome DevTools Protocol via WebSocket');
    send('Runtime.enable');
    send('Log.enable');
    send('Network.enable');
    send('Page.enable');

    setTimeout(() => {
      console.log('Navigating to http://localhost:3000/login ...');
      send('Page.navigate', { url: 'http://localhost:3000/login' });
    }, 2000);

    setTimeout(() => {
      console.log('Attempting UI Login as admin@fleetflow.com ...');
      const loginScript = `
        (async () => {
          const emailInput = document.querySelector('#identifier');
          const passInput = document.querySelector('#password');
          const submitBtn = document.querySelector('button[type="submit"]');

          if (!emailInput || !passInput || !submitBtn) return 'Inputs not found';

          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(emailInput, 'customer1@fleetflow.com');
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));

          setter.call(passInput, 'Demo@12345');
          passInput.dispatchEvent(new Event('input', { bubbles: true }));

          submitBtn.click();
          return 'Clicked submit with native setter';
        })()
      `;
      send('Runtime.evaluate', { expression: loginScript, awaitPromise: true });
    }, 4500);

    setTimeout(() => {
      console.log('Checking URL and page state after login...');
      send('Runtime.evaluate', {
        expression: '({ currentUrl: window.location.href, title: document.title, h1: document.querySelector("h1")?.innerText, bodySnippet: document.body.innerText.slice(0, 300) })',
        returnByValue: true,
      });
    }, 7500);

    setTimeout(() => {
      console.log('Inspection complete.');
      ws.close();
      chrome.kill();
      process.exit(0);
    }, 9000);
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      const args = msg.params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(' ');
      if (type === 'error' || type === 'warning') {
        console.log(`[Browser Console ${type.toUpperCase()}]:`, args);
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[Browser UNCAUGHT EXCEPTION]:', msg.params.exceptionDetails);
    } else if (msg.method === 'Network.loadingFailed') {
      console.log('[Browser Network Failed]:', msg.params.errorText, msg.params.type);
    } else if (msg.id && msg.result?.result?.value) {
      console.log('[Browser Eval Result]:', msg.result.result.value);
    }
  });

  ws.on('error', (e) => console.error('WS Error:', e.message));
}

run().catch(console.error);
