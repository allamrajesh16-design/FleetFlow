const fs = require('fs');

// 1. AdminDashboardPage.js
const pAdmin = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminDashboardPage.js';
let admin = fs.readFileSync(pAdmin, 'utf8');
if (!admin.includes('DashboardHeaderStrip')) {
  admin = 'import DashboardHeaderStrip from "../../components/common/DashboardHeaderStrip";\n' + admin;
  admin = admin.replace(
    '<div className="dashboard-header-strip admin-strip"><h1>Admin Dashboard</h1></div>',
    '<DashboardHeaderStrip role="admin" title="Admin Dashboard" defaultSubtitle="Real-time overview of fleet operations, users, and revenue" />'
  );
  fs.writeFileSync(pAdmin, admin, 'utf8');
  console.log('Updated AdminDashboardPage header strip');
}

// 2. ManagerDashboardPage.js
const pMgr = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerDashboardPage.js';
let mgr = fs.readFileSync(pMgr, 'utf8');
if (!mgr.includes('DashboardHeaderStrip')) {
  mgr = 'import DashboardHeaderStrip from "../../components/common/DashboardHeaderStrip";\n' + mgr;
  mgr = mgr.replace(
    '<div className="dashboard-header-strip manager-strip"><h1>Fleet Overview</h1></div>',
    '<DashboardHeaderStrip role="manager" title="Fleet Overview" defaultSubtitle="Real-time vehicle availability, active missions, and alerts" />'
  );
  fs.writeFileSync(pMgr, mgr, 'utf8');
  console.log('Updated ManagerDashboardPage header strip');
}

// 3. DriverDashboardPage.js
const pDrv = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/driver/DriverDashboardPage.js';
let drv = fs.readFileSync(pDrv, 'utf8');
if (!drv.includes('DashboardHeaderStrip')) {
  drv = 'import DashboardHeaderStrip from "../../components/common/DashboardHeaderStrip";\n' + drv;
  drv = drv.replace(
    '<div className="dashboard-header-strip driver-strip"><h1>Driver Dashboard</h1></div>',
    '<DashboardHeaderStrip role="driver" title="Driver Dashboard" defaultSubtitle="Trip execution and shift status" />'
  );
  fs.writeFileSync(pDrv, drv, 'utf8');
  console.log('Updated DriverDashboardPage header strip');
}

// 4. CustomerDashboardPage.js
const pCust = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/customer/CustomerDashboardPage.js';
let cust = fs.readFileSync(pCust, 'utf8');
if (!cust.includes('DashboardHeaderStrip')) {
  cust = 'import DashboardHeaderStrip from "../../components/common/DashboardHeaderStrip";\n' + cust;
  cust = cust.replace(
    '<div className="dashboard-header-strip customer-strip"><h1>Customer Portal</h1></div>',
    '<DashboardHeaderStrip role="customer" title="Customer Portal" defaultSubtitle="Bookings, live tracking, and digital payments" />'
  );
  fs.writeFileSync(pCust, cust, 'utf8');
  console.log('Updated CustomerDashboardPage header strip');
}

