const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Try requiring puppeteer from frontend
const puppeteerPath = path.resolve(__dirname, '../frontend/node_modules/puppeteer-core');
let puppeteer;
try {
  puppeteer = require(puppeteerPath);
} catch (e) {
  puppeteer = require('puppeteer-core');
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT_DIR = path.resolve(__dirname, '..');
const BEFORE_JSON_PATH = path.resolve(__dirname, 'scope_before.json');
const SCOPE_TAG = process.env.SCOPE_TAG || process.argv[3] || 'scope32';
const DOCS_SCOPE_BEFORE = path.resolve(ROOT_DIR, 'docs', SCOPE_TAG, 'before');
const DOCS_SCOPE_AFTER = path.resolve(ROOT_DIR, 'docs', SCOPE_TAG, 'after');

const SKIP_DIRS = new Set([
  'node_modules',
  'venv',
  'build',
  'media',
  'private_media',
  'logs',
  'tmp_emails',
  'docs',
  '__pycache__',
  '.pytest_cache',
  '.git',
  '.system_generated',
  '.user_uploaded',
  'coverage',
  '.idea',
  '.vscode'
]);

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.pyc') || entry.name.endsWith('.DS_Store')) continue;
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function getFileHashes() {
  const backendDir = path.resolve(ROOT_DIR, 'backend');
  const frontendSrcDir = path.resolve(ROOT_DIR, 'frontend/src');

  const files = [...walkDir(backendDir), ...walkDir(frontendSrcDir)];
  const hashes = {};
  for (const f of files) {
    const rel = path.relative(ROOT_DIR, f).replace(/\\/g, '/');
    hashes[rel] = hashFile(f);
  }
  return hashes;
}

const PAGES_CONFIG = [
  {
    role: 'PUBLIC',
    login: false,
    pages: [
      { slug: 'public_login', path: '/login' },
      { slug: 'public_register', path: '/register' },
      { slug: 'public_forgot_password', path: '/forgot-password' }
    ]
  },
  {
    role: 'ADMIN',
    login: true,
    email: 'wt.admin+1@gmail.com',
    password: 'Walkthrough@123',
    pages: [
      { slug: 'admin_dashboard', path: '/admin/dashboard' },
      { slug: 'admin_users', path: '/admin/users' },
      { slug: 'admin_approvals', path: '/admin/approvals' },
      { slug: 'admin_vehicles', path: '/admin/vehicles' },
      { slug: 'admin_drivers', path: '/admin/drivers' },
      { slug: 'admin_bookings', path: '/admin/bookings' },
      { slug: 'admin_assignments', path: '/admin/assignments' },
      { slug: 'admin_trips', path: '/admin/trips' },
      { slug: 'admin_bus_schedules', path: '/admin/bus-schedules' },
      { slug: 'admin_payments', path: '/admin/payments' },
      { slug: 'admin_fuel', path: '/admin/fuel' },
      { slug: 'admin_expenses', path: '/admin/expenses' },
      { slug: 'admin_documents', path: '/admin/documents' },
      { slug: 'admin_maintenance', path: '/admin/maintenance' },
      { slug: 'admin_reports', path: '/admin/reports' }
    ]
  },
  {
    role: 'FLEET_MANAGER',
    login: true,
    email: 'wt.manager+1@gmail.com',
    password: 'Walkthrough@123',
    pages: [
      { slug: 'manager_dashboard', path: '/manager/dashboard' },
      { slug: 'manager_approvals', path: '/manager/approvals' },
      { slug: 'manager_bookings', path: '/manager/bookings' },
      { slug: 'manager_assignments', path: '/manager/assignments' },
      { slug: 'manager_trips', path: '/manager/trips' },
      { slug: 'manager_fleet', path: '/manager/fleet' },
      { slug: 'manager_maintenance', path: '/manager/maintenance' },
      { slug: 'manager_payments', path: '/manager/payments' },
      { slug: 'manager_fuel', path: '/manager/fuel' },
      { slug: 'manager_expenses', path: '/manager/expenses' },
      { slug: 'manager_documents', path: '/manager/documents' },
      { slug: 'manager_bus_monitor', path: '/manager/bus-monitor' }
    ]
  },
  {
    role: 'DRIVER',
    login: true,
    email: 'wt.driver+1@gmail.com',
    password: 'Walkthrough@123',
    pages: [
      { slug: 'driver_dashboard', path: '/driver/dashboard' },
      { slug: 'driver_trips', path: '/driver/trips' },
      { slug: 'driver_history', path: '/driver/history' },
      { slug: 'driver_fuel', path: '/driver/fuel' },
      { slug: 'driver_expenses', path: '/driver/expenses' },
      { slug: 'driver_documents', path: '/driver/documents' }
    ]
  },
  {
    role: 'CUSTOMER',
    login: true,
    email: 'customer1@fleetflow.com',
    password: 'Walkthrough@123',
    pages: [
      { slug: 'customer_dashboard', path: '/customer/dashboard' },
      { slug: 'customer_book_vehicle', path: '/customer/book-vehicle' },
      { slug: 'customer_bookings', path: '/customer/my-bookings' },
      { slug: 'customer_payments', path: '/customer/payments' }
    ]
  }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureAllPages(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const tempUserDir = path.join(
    os.tmpdir(),
    `scope_guard_chrome_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    pipe: true,
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  for (const group of PAGES_CONFIG) {
    if (group.login) {
      console.log(`[ScopeGuard] Authenticating as ${group.role} (${group.email})...`);
      await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('fleetflow_theme', 'light');
        document.documentElement.setAttribute('data-theme', 'light');
      });
      await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', {
        timeout: 10000,
      });
      await page.type(
        'input[name="identifier"], #login-identifier-input, input[type="text"]',
        group.email
      );
      await page.type(
        'input[name="password"], #login-password-input, input[type="password"]',
        group.password
      );
      await page.click('button[type="submit"]');
      await sleep(2500);
    }

    for (const p of group.pages) {
      const destPath = path.join(outputDir, `${p.slug}.png`);
      try {
        await page.goto(`http://localhost:3000${p.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'light');
        });
        await sleep(1200);
        await page.screenshot({ path: destPath });
        console.log(`[ScopeGuard] Screenshot saved: ${p.slug} -> ${p.path}`);
      } catch (err) {
        console.warn(`[ScopeGuard] Failed to capture ${p.slug} (${p.path}): ${err.message}`);
      }
    }
  }

  await browser.close();
}

async function runSnapshot() {
  console.log('='.repeat(80));
  console.log(' FLEETFLOW SCOPE GUARD: CREATING BASELINE SNAPSHOT');
  console.log('='.repeat(80));

  const hashes = getFileHashes();
  const fileCount = Object.keys(hashes).length;
  fs.writeFileSync(BEFORE_JSON_PATH, JSON.stringify(hashes, null, 2), 'utf-8');
  console.log(`[ScopeGuard] Computed SHA-256 hashes for ${fileCount} files.`);
  console.log(`[ScopeGuard] Saved snapshot to ${BEFORE_JSON_PATH}`);

  console.log(`[ScopeGuard] Capturing baseline screenshots into ${DOCS_SCOPE_BEFORE}...`);
  await captureAllPages(DOCS_SCOPE_BEFORE);
  console.log(`[ScopeGuard] Baseline snapshot complete!`);
}

async function runCompare() {
  console.log('='.repeat(80));
  console.log(' FLEETFLOW SCOPE GUARD: VERIFYING SCOPE AND PIXEL INTEGRITY');
  console.log('='.repeat(80));

  if (!fs.existsSync(BEFORE_JSON_PATH)) {
    console.error(`[Error] Baseline snapshot not found at ${BEFORE_JSON_PATH}. Run 'snapshot' first!`);
    process.exit(1);
  }

  const beforeHashes = JSON.parse(fs.readFileSync(BEFORE_JSON_PATH, 'utf-8'));
  const currentHashes = getFileHashes();

  const added = [];
  const deleted = [];
  const changed = [];

  for (const [file, hash] of Object.entries(currentHashes)) {
    if (!beforeHashes[file]) {
      added.push(file);
    } else if (beforeHashes[file] !== hash) {
      changed.push(file);
    }
  }

  for (const file of Object.keys(beforeHashes)) {
    if (!currentHashes[file]) {
      deleted.push(file);
    }
  }

  console.log('\n--- SCOPE FILE AUDIT ---');
  console.log(`Added files:   ${added.length}`);
  console.log(`Deleted files: ${deleted.length}`);
  console.log(`Changed files: ${changed.length}`);

  // Mapping rules for Registration Email Validation & Security Scope
  function getItemForFile(file) {
    const lower = file.toLowerCase();
    if (lower.includes('tripmap')) {
      return 'ITEM 2: Shared TripMap Component';
    }
    if (lower.includes('managertripspage') || lower.includes('admintripspage') || lower.includes('tripsrebuild') || lower.includes('tripmonitoring')) {
      return 'ITEM 3: Trip Monitoring Page (/manager/trips & /admin/trips)';
    }
    if (lower.includes('usedriverlocation') || lower.includes('driverlocation')) {
      return 'ITEM 1: Driver Location Sharing Hook (speed, heading, accuracy)';
    }
    if (lower.includes('geocache') || lower.includes('simulate_trip_gps') || lower.includes('test_trip_monitor') || lower.includes('trips/services.py') || lower.includes('trips/views.py') || lower.includes('trips/models.py') || lower.includes('trips/serializers.py') || lower.includes('trips/urls.py') || lower.includes('trips/migrations')) {
      return 'ITEM 1 & 4: Places & Routes Backend, Monitor/Track Endpoints & GPS Simulator';
    }
    if (lower.includes('validator') || lower.includes('email_validation') || lower.includes('dummy_local_parts') || lower.includes('disposable_domains') || lower.includes('check-email') || lower.includes('check_email') || lower.includes('accounts/views.py') || lower.includes('accounts/serializers.py') || lower.includes('accounts/tests.py') || lower.includes('registerpage') || lower.includes('api/auth.js') || lower.includes('test_email_delivery.py') || lower.includes('test_permission_matrix.py')) {
      return 'ITEM 1 & 3 & 5: Shared Registration Email Validator, Tests & Register Page Field';
    }
    if (lower.includes('emails.py') || lower.includes('purge_unverified') || lower.includes('run_scheduled_jobs') || lower.includes('rollback')) {
      return 'ITEM 2: OTP Proof, Refusal Handling & Unverified 24h Purge';
    }
    if (lower.includes('readme.md') || lower.includes('docs/guide') || lower.includes('guide')) {
      return 'ITEM 4: Documentation (What can and cannot be checked)';
    }
    if (lower.includes('datatable') || lower.includes('driverdocumentspage')) {
      return 'RESOLVED ISSUE: Driver documents table layout & column sizing';
    }
    if (lower.includes('repair_demo_files') || lower.includes('seed_demo_data') || lower.includes('can_view_document') || (lower.includes('document') && !lower.includes('driverdocumentspage.css')) || lower.includes('item1')) {
      return 'PRIOR SCOPE: Driver documents';
    }
    if (lower.includes('assignment') || lower.includes('trips/views.py') || lower.includes('item3')) {
      return 'PRIOR SCOPE: Assignments roster';
    }
    return 'UNASSIGNED (Check justification)';
  }

  console.log('\nDetailed File Item Mapping:');
  for (const f of [...changed, ...added, ...deleted]) {
    const item = getItemForFile(f);
    const status = added.includes(f) ? '[ADDED]' : deleted.includes(f) ? '[DELETED]' : '[MODIFIED]';
    console.log(`  ${status} ${f} -> ${item}`);
  }

  console.log(`\n[ScopeGuard] Capturing after-change screenshots into ${DOCS_SCOPE_AFTER}...`);
  await captureAllPages(DOCS_SCOPE_AFTER);

  // Pixel comparison using Puppeteer canvas
  console.log('\n--- PIXEL COMPARISON OF UNTOUCHED PAGES ---');
  const tempUserDir = path.join(
    os.tmpdir(),
    `scope_guard_compare_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    pipe: true,
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Define untouched pages that should NOT have unintended diffs (threshold 0.5%)
  // Items 1-4 touched: expenses, fleet/vehicles, forgot-password, and top nav bar (which is on dashboard layouts).
  const filesBefore = fs.readdirSync(DOCS_SCOPE_BEFORE).filter((f) => f.endsWith('.png'));

  console.log(
    'Page Slug'.padEnd(30) +
    'Status'.padEnd(14) +
    'Pixel Diff %'.padEnd(16) +
    'Verdict'
  );
  console.log('-'.repeat(80));

  for (const file of filesBefore) {
    const pBefore = path.join(DOCS_SCOPE_BEFORE, file);
    const pAfter = path.join(DOCS_SCOPE_AFTER, file);

    if (!fs.existsSync(pAfter)) {
      console.log(`${file.padEnd(30)} MISSING AFTER  -               FAIL`);
      continue;
    }

    const b64Before = fs.readFileSync(pBefore).toString('base64');
    const b64After = fs.readFileSync(pAfter).toString('base64');

    const diffResult = await page.evaluate(
      async (dataA, dataB) => {
        function loadImage(b64) {
          return new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = 'data:image/png;base64,' + b64;
          });
        }

        const [imgA, imgB] = await Promise.all([loadImage(dataA), loadImage(dataB)]);
        const width = Math.min(imgA.width, imgB.width);
        const height = Math.min(imgA.height, imgB.height);

        const canvasA = document.createElement('canvas');
        canvasA.width = width;
        canvasA.height = height;
        const ctxA = canvasA.getContext('2d');
        ctxA.drawImage(imgA, 0, 0);

        const canvasB = document.createElement('canvas');
        canvasB.width = width;
        canvasB.height = height;
        const ctxB = canvasB.getContext('2d');
        ctxB.drawImage(imgB, 0, 0);

        const data1 = ctxA.getImageData(0, 0, width, height).data;
        const data2 = ctxB.getImageData(0, 0, width, height).data;

        let diffPixels = 0;
        let totalAudited = 0;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            // Apply mask to dynamic regions:
            // Top right area (user avatar/name/bell/badge): x > 1100 && y < 70
            // Top bar height zone if Item 4 adjusts top nav: y < 64
            const isTopBar = y < 64;
            const isLiveBadge = x > 1100 && y < 70;
            if (isLiveBadge) continue;

            totalAudited++;
            const idx = (y * width + x) * 4;
            const rDiff = Math.abs(data1[idx] - data2[idx]);
            const gDiff = Math.abs(data1[idx + 1] - data2[idx + 1]);
            const bDiff = Math.abs(data1[idx + 2] - data2[idx + 2]);

            // RGB color difference threshold
            if (rDiff > 12 || gDiff > 12 || bDiff > 12) {
              diffPixels++;
            }
          }
        }

        const diffPercent = (diffPixels / totalAudited) * 100;
        return {
          diffPercent: Math.round(diffPercent * 100) / 100,
          diffPixels,
          totalAudited
        };
      },
      b64Before,
      b64After
    );

    const isIntentionalPage =
      file.includes('expense') ||
      file.includes('vehicle') ||
      file.includes('fleet') ||
      file.includes('forgot_password') ||
      file.includes('manager_trips') ||
      file.includes('admin_trips');

    let verdict = 'PASS';
    if (!isIntentionalPage && diffResult.diffPercent > 0.5) {
      verdict = 'DIFF > 0.5%';
    } else if (isIntentionalPage) {
      verdict = 'INTENTIONAL (Item 1-4)';
    }

    console.log(
      file.padEnd(30) +
      'COMPARED'.padEnd(14) +
      `${diffResult.diffPercent}%`.padEnd(16) +
      verdict
    );
  }

  await browser.close();
  console.log('='.repeat(80));
}

const command = process.argv[2] || 'snapshot';
if (command === 'snapshot') {
  runSnapshot().catch((err) => {
    console.error('Snapshot failed:', err);
    process.exit(1);
  });
} else if (command === 'compare') {
  runCompare().catch((err) => {
    console.error('Compare failed:', err);
    process.exit(1);
  });
} else {
  console.log(`Unknown command: ${command}. Use 'snapshot' or 'compare'.`);
}
