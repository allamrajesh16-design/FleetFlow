const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(process.cwd(), 'frontend', 'build');
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(buildDir, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(buildDir, 'index.html');
  }
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(3000, () => {
  console.log('Server started on 3000');
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const outDir = path.join(process.cwd(), 'docs', 'screenshots', 'forgot-otp');
  fs.mkdirSync(outDir, { recursive: true });

  const tasks = [
    { name: 'step1-email-1366.png', size: '1366,768', url: 'http://localhost:3000/forgot-password' },
    { name: 'step1-email-360.png', size: '360,640', url: 'http://localhost:3000/forgot-password' },
    { name: 'step2-code-1366.png', size: '1366,768', url: 'http://localhost:3000/forgot-password/verify' },
    { name: 'step2-code-360.png', size: '360,640', url: 'http://localhost:3000/forgot-password/verify' },
    { name: 'step3-password-1366.png', size: '1366,768', url: 'http://localhost:3000/forgot-password/new-password' },
    { name: 'step3-password-360.png', size: '360,640', url: 'http://localhost:3000/forgot-password/new-password' },
    { name: 'reset-deprecated-1366.png', size: '1366,768', url: 'http://localhost:3000/reset-password' },
  ];

  for (const t of tasks) {
    const dest = path.join(outDir, t.name);
    console.log(`Capturing ${t.name}...`);
    try {
      execSync(`"${chrome}" --headless=new --disable-gpu --screenshot="${dest}" --window-size=${t.size} ${t.url}`);
    } catch (err) {
      console.error(`Failed ${t.name}:`, err.message);
    }
  }

  console.log('Finished capturing all screenshots.');
  server.close();
  process.exit(0);
});

