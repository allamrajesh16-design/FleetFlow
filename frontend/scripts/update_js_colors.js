const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', path.relative('C:/Users/RAJESH/Desktop/FleetFlow/frontend', filePath));
  }
}

// 1. StatCard.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/common/StatCard.js', [
  ['#EFF6FF', 'var(--blue-50)'],
  ['#2563EB', 'var(--primary)']
]);

// 2. EmptyState.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/common/EmptyState.js', [
  ['#F1F5F9', 'var(--neutral-bg)'],
  ['#E2E8F0', 'var(--border)'],
  ['#94A3B8', 'var(--text-subtle)'],
  ['#CBD5E1', 'var(--border)'],
  ['#2563EB', 'var(--primary)']
]);

// 3. ErrorState.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/common/ErrorState.js', [
  ['#FEE2E2', 'var(--danger-bg)'],
  ['#FCA5A5', 'var(--danger-bg)'],
  ['#DC2626', 'var(--danger)']
]);

// 4. Skeleton.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/common/Skeleton.js', [
  ['#FFFFFF', 'var(--surface)'],
  ['#E2E8F0', 'var(--border)']
]);

// 5. FileInput.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/forms/FileInput.js', [
  ['#2563EB', 'var(--primary)'],
  ['#64748B', 'var(--text-muted)'],
  ['#EFF6FF', 'var(--blue-50)']
]);

// 6. SearchInput.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/forms/SearchInput.js', [
  ['#2563EB', 'var(--primary)']
]);

// 7. images.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/config/images.js', [
  ['#2563EB', '2563EB']
]);

// 8. AdminApprovalsPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminApprovalsPage.js', [
  ['#F3E8FF', 'var(--purple-bg)'],
  ['#FEF3C7', 'var(--warning-bg)'],
  ['#6B21A8', 'var(--purple-text)'],
  ['#B45309', 'var(--warning-text)']
]);

// 9. AdminBookingsPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminBookingsPage.js', [
  ['#EFF6FF', 'var(--blue-50)'],
  ['#F0FDF4', 'var(--success-bg)'],
  ['#1E40AF', 'var(--blue-700)'],
  ['#166534', 'var(--success-text)']
]);

// 10. AdminDashboardPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminDashboardPage.js', [
  ['#059669', 'var(--success-text)']
]);

// 11. AdminReportsPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminReportsPage.js', [
  ['#64748B', 'var(--text-muted)'],
  ['#F1F5F9', 'var(--neutral-bg)'],
  ['#2563EB', 'var(--primary)'],
  ['#3B82F6', 'var(--blue-600)']
]);

// 12. AdminSettingsPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminSettingsPage.js', [
  ['#f8fafc', 'var(--bg)'],
  ['#2563eb', 'var(--primary)'],
  ['#ffffff', 'var(--surface)']
]);

// 13. AdminUsersPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminUsersPage.js', [
  ['#E0E7FF', 'var(--blue-100)'],
  ['#F3E8FF', 'var(--purple-bg)'],
  ['#FEF3C7', 'var(--warning-bg)'],
  ['#EFF6FF', 'var(--blue-50)'],
  ['#3730A3', 'var(--indigo-600)'],
  ['#6B21A8', 'var(--purple-text)'],
  ['#B45309', 'var(--warning-text)'],
  ['#1E40AF', 'var(--blue-700)']
]);

// 14. AdminVehiclesPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminVehiclesPage.js', [
  ['#15803D', 'var(--success-text)'],
  ['#EFF6FF', 'var(--blue-50)'],
  ['#F0FDF4', 'var(--success-bg)'],
  ['#FFFBEB', 'var(--warning-bg)'],
  ['#1E40AF', 'var(--blue-700)'],
  ['#166534', 'var(--success-text)'],
  ['#92400E', 'var(--warning-text)']
]);

// 15. CustomerDashboardPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/customer/CustomerDashboardPage.js', [
  ['#64748B', 'var(--text-muted)'],
  ['#F8FAFC', 'var(--bg)'],
  ['#E2E8F0', 'var(--border)'],
  ['#FFFFFF', 'var(--surface)'],
  ['#0F172A', 'var(--text)']
]);

// 16. CustomerLiveTrackingPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/customer/CustomerLiveTrackingPage.js', [
  ['#2563EB', 'var(--primary)'],
  ['#FFFFFF', 'var(--surface)'],
  ['#64748B', 'var(--text-muted)'],
  ['#94A3B8', 'var(--text-subtle)']
]);

// 17. CustomerVehicleSelectPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/customer/CustomerVehicleSelectPage.js', [
  ['#2563EB', 'var(--primary)']
]);

// 18. DriverDashboardPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/driver/DriverDashboardPage.js', [
  ['#2563EB', 'var(--primary)'],
  ['#D97706', 'var(--amber-500)']
]);

// 19. DriverExpensesPage.js & DriverFuelPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/driver/DriverExpensesPage.js', [
  ['#FEF2F2', 'var(--danger-bg)'],
  ['#F87171', 'var(--danger)'],
  ['#991B1B', 'var(--danger-text)']
]);
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/driver/DriverFuelPage.js', [
  ['#FEF2F2', 'var(--danger-bg)'],
  ['#F87171', 'var(--danger)'],
  ['#991B1B', 'var(--danger-text)']
]);

// 20. DriverMyTripsPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/driver/DriverMyTripsPage.js', [
  ['#64748B', 'var(--text-muted)']
]);

// 21. DriverPaymentQrPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/driver/DriverPaymentQrPage.js', [
  ['#10B981', 'var(--chart-3)'],
  ['#3B82F6', 'var(--chart-1)'],
  ['#F59E0B', 'var(--chart-4)'],
  ['#EC4899', 'var(--chart-5)'],
  ['#8B5CF6', 'var(--chart-5)']
]);

// 22. ManagerApprovalsPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerApprovalsPage.js', [
  ['#EFF6FF', 'var(--blue-50)'],
  ['#F0FDF4', 'var(--success-bg)'],
  ['#1E40AF', 'var(--blue-700)'],
  ['#166534', 'var(--success-text)']
]);

// 23. ManagerAssignmentsPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerAssignmentsPage.js', [
  ['#FEF2F2', 'var(--danger-bg)'],
  ['#F87171', 'var(--danger)'],
  ['#991B1B', 'var(--danger-text)'],
  ['#B91C1C', 'var(--danger-text)'],
  ['#FFFBEB', 'var(--warning-bg)'],
  ['#FBBF24', 'var(--amber-500)'],
  ['#92400E', 'var(--warning-text)'],
  ['#B45309', 'var(--warning-text)'],
  ['#2563EB', 'var(--primary)'],
  ['#10B981', 'var(--success)']
]);

// 24. ManagerBusMonitorPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerBusMonitorPage.js', [
  ['#EF4444', 'var(--danger)'],
  ['#F59E0B', 'var(--amber-500)'],
  ['#10B981', 'var(--success)']
]);

// 25. ManagerDashboardPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerDashboardPage.js', [
  ['#2563EB', 'var(--chart-1)'],
  ['#10B981', 'var(--chart-3)'],
  ['#F59E0B', 'var(--chart-4)'],
  ['#EF4444', 'var(--chart-6)'],
  ['#059669', 'var(--success-text)']
]);

// 26. ManagerFleetPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerFleetPage.js', [
  ['#15803D', 'var(--success-text)'],
  ['#EFF6FF', 'var(--blue-50)'],
  ['#F0FDF4', 'var(--success-bg)'],
  ['#FFFBEB', 'var(--warning-bg)'],
  ['#1E40AF', 'var(--blue-700)'],
  ['#166534', 'var(--success-text)'],
  ['#92400E', 'var(--warning-text)']
]);

// 27. ManagerTripsPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerTripsPage.js', [
  ['#2563EB', 'var(--primary)'],
  ['#64748B', 'var(--text-muted)'],
  ['#FFFFFF', 'var(--surface)'],
  ['#94A3B8', 'var(--text-subtle)']
]);

// 28. DevMotionPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/public/DevMotionPage.js', [
  ['#22C55E', 'var(--chart-3)'],
  ['#2563EB', 'var(--chart-1)'],
  ['#F59E0B', 'var(--chart-4)'],
  ['#EC4899', 'var(--chart-5)'],
  ['#8B5CF6', 'var(--chart-5)']
]);

// 29. RegisterPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/public/RegisterPage.js', [
  ['#16a34a', 'var(--success)'],
  ['#E2E8F0', 'var(--border)'],
  ['#EF4444', 'var(--danger)'],
  ['#F59E0B', 'var(--amber-500)'],
  ['#3B82F6', 'var(--primary)'],
  ['#10B981', 'var(--success)']
]);

// 30. VerifyOtpPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/public/VerifyOtpPage.js', [
  ['#16a34a', 'var(--success)'],
  ['#d97706', 'var(--amber-500)']
]);

// 31. DocumentsManagementPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/shared/DocumentsManagementPage.js', [
  ['#059669', 'var(--success-text)']
]);

// 32. ExpensesManagementPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/shared/ExpensesManagementPage.js', [
  ['#2563EB', 'var(--chart-1)'],
  ['#10B981', 'var(--chart-3)'],
  ['#F59E0B', 'var(--chart-4)'],
  ['#EF4444', 'var(--chart-6)'],
  ['#8B5CF6', 'var(--chart-5)'],
  ['#06B6D4', 'var(--chart-2)'],
  ['#64748B', 'var(--text-muted)']
]);

// 33. FuelManagementPage.js
replaceInFile('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/shared/FuelManagementPage.js', [
  ['#64748B', 'var(--text-muted)']
]);

// 34. Dashboards placeholders
['AdminDashboardPlaceholder.js', 'CustomerDashboardPlaceholder.js', 'DriverDashboardPlaceholder.js', 'ManagerDashboardPlaceholder.js'].forEach(p => {
  const f = path.join('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/dashboards', p);
  replaceInFile(f, [
    ['#2563EB', 'var(--primary)'],
    ['#EFF6FF', 'var(--blue-50)'],
    ['#15803D', 'var(--success-text)'],
    ['#DCFCE7', 'var(--success-bg)'],
    ['#7E22CE', 'var(--purple-text)'],
    ['#F3E8FF', 'var(--purple-bg)'],
    ['#B45309', 'var(--warning-text)'],
    ['#FEF3C7', 'var(--warning-bg)'],
    ['#7C3AED', 'var(--purple-text)'],
    ['#F5F3FF', 'var(--purple-bg)'],
    ['#D97706', 'var(--warning-text)'],
    ['#DC2626', 'var(--danger)'],
    ['#FEE2E2', 'var(--danger-bg)'],
    ['#64748B', 'var(--text-muted)'],
    ['#059669', 'var(--success-text)'],
    ['#475569', 'var(--neutral-text)'],
    ['#F1F5F9', 'var(--neutral-bg)']
  ]);
});

console.log('All targeted JS files updated');

