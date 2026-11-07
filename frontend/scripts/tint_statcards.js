const fs = require('fs');

// AdminDashboardPage.js 4 primary cards
let admin = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminDashboardPage.js', 'utf8');
admin = admin.replace(
  'title="Total Vehicles"\n          value={data?.total_vehicles ?? 0}\n          icon={<VehicleIcon size={24} />}',
  'title="Total Vehicles"\n          value={data?.total_vehicles ?? 0}\n          icon={<VehicleIcon size={24} />}\n          iconBg="var(--blue-50)"\n          iconColor="var(--primary)"'
);
admin = admin.replace(
  'title="Total Drivers"\n          value={data?.total_drivers ?? 0}\n          icon={<DriverIcon size={24} />}',
  'title="Total Drivers"\n          value={data?.total_drivers ?? 0}\n          icon={<DriverIcon size={24} />}\n          iconBg="var(--blue-100)"\n          iconColor="var(--cyan-600)"'
);
admin = admin.replace(
  'title="Total Customers"\n          value={data?.total_customers ?? 0}\n          icon={<UsersIcon size={24} />}',
  'title="Total Customers"\n          value={data?.total_customers ?? 0}\n          icon={<UsersIcon size={24} />}\n          iconBg="var(--success-bg)"\n          iconColor="var(--success)"'
);
admin = admin.replace(
  'title="Total Bookings"\n          value={data?.total_bookings ?? 0}\n          icon={<BookingIcon size={24} />}',
  'title="Total Bookings"\n          value={data?.total_bookings ?? 0}\n          icon={<BookingIcon size={24} />}\n          iconBg="var(--warning-bg)"\n          iconColor="var(--amber-500)"'
);
fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/admin/AdminDashboardPage.js', admin, 'utf8');

// ManagerDashboardPage.js 4 primary cards
let mgr = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerDashboardPage.js', 'utf8');
mgr = mgr.replace(
  'title="Total Vehicles"\n          value={data?.total_vehicles ?? 0}\n          icon={<VehicleIcon size={24} />}',
  'title="Total Vehicles"\n          value={data?.total_vehicles ?? 0}\n          icon={<VehicleIcon size={24} />}\n          iconBg="var(--blue-50)"\n          iconColor="var(--primary)"'
);
mgr = mgr.replace(
  'title="Active Trips"\n          value={data?.active_trips ?? 0}\n          icon={<TripIcon size={24} />}',
  'title="Active Trips"\n          value={data?.active_trips ?? 0}\n          icon={<TripIcon size={24} />}\n          iconBg="var(--blue-100)"\n          iconColor="var(--cyan-600)"'
);
mgr = mgr.replace(
  'title="Pending Approvals"\n          value={data?.pending_approvals ?? 0}\n          icon={<BookingIcon size={24} />}',
  'title="Pending Approvals"\n          value={data?.pending_approvals ?? 0}\n          icon={<BookingIcon size={24} />}\n          iconBg="var(--warning-bg)"\n          iconColor="var(--amber-500)"'
);
mgr = mgr.replace(
  'title="Bus Bookings Due"\n          value={data?.bus_bookings_due ?? 0}\n          icon={<SettingsIcon size={24} />}',
  'title="Bus Bookings Due"\n          value={data?.bus_bookings_due ?? 0}\n          icon={<SettingsIcon size={24} />}\n          iconBg="var(--success-bg)"\n          iconColor="var(--success)"'
);
fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/manager/ManagerDashboardPage.js', mgr, 'utf8');

console.log('Admin and Manager StatCard tints updated successfully');

