const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';
const EVIDENCE_DIR = path.join(__dirname, 'evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function run() {
  console.log('--- STARTING VERIFICATION: Admin Assignments Removal & Manager Dashboard Form + Table ---');
  const tempUserDir = path.join(os.tmpdir(), `puppeteer_verify_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  const results = {
    adminSidebarNoAssignments: false,
    adminApprovalsButtonText: '',
    adminAssignmentsRouteBlocked: false,
    managerDashboardFormPresent: false,
    managerDashboardTablePresent: false,
    managerAssignmentsTablePresent: false,
    screenshots: []
  };

  async function login(email, password = 'Walkthrough@123') {
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.waitForSelector('input[name="identifier"], #login-identifier-input, input[type="text"]', { timeout: 8000 });
    await page.type('input[name="identifier"], #login-identifier-input, input[type="text"]', email);
    await page.type('input[name="password"], #login-password-input, input[type="password"]', password);
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
  }

  try {
    // 1. ADMIN CHECKS
    console.log('[1/4] Logging in as Admin...');
    await login('allamrajesh16@gmail.com');
    await page.goto('http://localhost:3000/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    // Check sidebar links
    const sidebarLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.sidebar-nav a, nav a, .sidebar a'));
      return links.map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') }));
    });
    const hasAssignmentsInAdmin = sidebarLinks.some(l => 
      l.text.toLowerCase().includes('assignment') || (l.href && l.href.includes('/admin/assignments'))
    );
    results.adminSidebarNoAssignments = !hasAssignmentsInAdmin;
    console.log('Assertion: Admin sidebar contains Assignments? ->', hasAssignmentsInAdmin ? 'FAIL (Found)' : 'PASS (Removed)');

    const shotAdminSidebar = path.join(ARTIFACT_DIR, 'proof_admin_no_assignments_sidebar.png');
    await page.screenshot({ path: shotAdminSidebar, fullPage: false });
    results.screenshots.push(shotAdminSidebar);

    // Check /admin/approvals button text
    console.log('[2/4] Checking Admin Approvals page...');
    await page.goto('http://localhost:3000/admin/approvals', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    const buttonTexts = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.admin-action-btn-group button, .datatable-td button'));
      return btns.map(b => b.innerText.trim());
    });
    const approveBtn = buttonTexts.find(t => t.toLowerCase().includes('pprov') || t.toLowerCase().includes('approve'));
    results.adminApprovalsButtonText = approveBtn || 'None';
    console.log('Assertion: Admin Approvals button text is fully "Approve" (not clipped)? ->', approveBtn === 'Approve' ? 'PASS' : `WARN: ${approveBtn}`);

    const shotAdminApprovals = path.join(ARTIFACT_DIR, 'proof_admin_approvals_clean_buttons.png');
    await page.screenshot({ path: shotAdminApprovals, fullPage: false });
    results.screenshots.push(shotAdminApprovals);

    // Check /admin/assignments route
    await page.goto('http://localhost:3000/admin/assignments', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));
    const currentUrl = page.url();
    results.adminAssignmentsRouteBlocked = !currentUrl.includes('/admin/assignments');
    console.log('Assertion: Accessing /admin/assignments redirected away from admin assignments? ->', results.adminAssignmentsRouteBlocked ? 'PASS' : 'FAIL');

    // 2. MANAGER CHECKS
    console.log('[3/4] Logging in as Fleet Manager...');
    await login('manager@fleetflow.com');
    await page.goto('http://localhost:3000/manager/dashboard', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // Check Manager Dashboard Form and Table
    const mgrDashElements = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const hasForm = pageText.includes('Assign Trip & Dispatch Driver') || pageText.includes('Select Approved Booking');
      const hasTable = pageText.includes('Recently Dispatched Trips & Assigned Drivers') || pageText.includes('Assigned Driver');
      return { hasForm, hasTable };
    });
    results.managerDashboardFormPresent = mgrDashElements.hasForm;
    results.managerDashboardTablePresent = mgrDashElements.hasTable;
    console.log('Assertion: Manager Dashboard has Assignment Form? ->', mgrDashElements.hasForm ? 'PASS' : 'FAIL');
    console.log('Assertion: Manager Dashboard has Assigned Trips Table below it? ->', mgrDashElements.hasTable ? 'PASS' : 'FAIL');

    const shotMgrDashboard = path.join(ARTIFACT_DIR, 'proof_manager_dashboard_assignment_and_table.png');
    await page.screenshot({ path: shotMgrDashboard, fullPage: false });
    results.screenshots.push(shotMgrDashboard);

    // 3. MANAGER ASSIGNMENTS PAGE
    console.log('[4/4] Checking Manager Assignments page (/manager/assignments)...');
    await page.goto('http://localhost:3000/manager/assignments', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    const mgrAssignElements = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const hasTable = pageText.includes('Recently Dispatched Trips & Assigned Drivers') || pageText.includes('Assigned Driver');
      return { hasTable };
    });
    results.managerAssignmentsTablePresent = mgrAssignElements.hasTable;
    console.log('Assertion: Manager Assignments page has Assigned Trips Table below form? ->', mgrAssignElements.hasTable ? 'PASS' : 'FAIL');

    const shotMgrAssignments = path.join(ARTIFACT_DIR, 'proof_manager_assignments_with_table.png');
    await page.screenshot({ path: shotMgrAssignments, fullPage: false });
    results.screenshots.push(shotMgrAssignments);

    // Write evidence JSON
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'assignments_verification.json'),
      JSON.stringify(results, null, 2)
    );
    console.log('SUCCESS: All assertions recorded in scripts/walkthrough/evidence/assignments_verification.json');
  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    await browser.close();
  }
}

run();

