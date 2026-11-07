const fs = require('fs');

// 1. AdminDashboardPage.js
let admin = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminDashboardPage.js', 'utf8');
if (!admin.includes('dashboard-header-strip')) {
  admin = admin.replace(
    '<div className="admin-header-row">',
    '<div className="dashboard-header-strip admin-strip"><h1>Admin Dashboard</h1></div>\n      <div className="admin-header-row">'
  );
  fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminDashboardPage.js', admin, 'utf8');
  console.log('Admin strip added');
}

// 2. ManagerDashboardPage.js
let mgr = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerDashboardPage.js', 'utf8');
if (!mgr.includes('dashboard-header-strip')) {
  mgr = mgr.replace(
    '<div className="admin-header-row">',
    '<div className="dashboard-header-strip manager-strip"><h1>Fleet Overview</h1></div>\n      <div className="admin-header-row">'
  );
  fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerDashboardPage.js', mgr, 'utf8');
  console.log('Manager strip added');
}

// 3. DriverDashboardPage.js
let drv = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/driver/DriverDashboardPage.js', 'utf8');
if (!drv.includes('dashboard-header-strip')) {
  drv = drv.replace(
    '<div className="driver-greeting-header">',
    '<div className="dashboard-header-strip driver-strip"><h1>Driver Dashboard</h1></div>\n      <div className="driver-greeting-header">'
  );
  fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/driver/DriverDashboardPage.js', drv, 'utf8');
  console.log('Driver strip added');
}

// 4. CustomerDashboardPage.js
let cust = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/customer/CustomerDashboardPage.js', 'utf8');
if (!cust.includes('dashboard-header-strip')) {
  cust = cust.replace(
    '<div className="customer-greeting-card">',
    '<div className="dashboard-header-strip customer-strip"><h1>Customer Portal</h1></div>\n      <div className="customer-greeting-card">'
  );
  fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/customer/CustomerDashboardPage.js', cust, 'utf8');
  console.log('Customer strip added');
}

