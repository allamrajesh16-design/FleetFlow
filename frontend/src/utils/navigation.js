/**
 * Navigation helpers for FleetFlow.
 * Maps entity types and IDs to the appropriate role-based detail or list route.
 */

export function getDetailPath(role, type, id) {
  const normRole = String(role || '').toUpperCase();
  const normType = String(type || '').toLowerCase();
  const openParam = id ? `?open=${encodeURIComponent(id)}` : '';

  switch (normRole) {
    case 'ADMIN':
      switch (normType) {
        case 'booking':
        case 'bookings':
          return id ? `/admin/bookings${openParam}` : '/admin/bookings';
        case 'trip':
        case 'trips':
          return id ? `/admin/trips${openParam}` : '/admin/trips';
        case 'payment':
        case 'payments':
          return id ? `/admin/payments${openParam}` : '/admin/payments';
        case 'fuel':
          return id ? `/admin/fuel${openParam}` : '/admin/fuel';
        case 'expense':
        case 'expenses':
          return id ? `/admin/expenses${openParam}` : '/admin/expenses';
        case 'document':
        case 'documents':
          return id ? `/admin/documents${openParam}` : '/admin/documents';
        case 'user':
        case 'users':
        case 'approval':
        case 'approvals':
          return id ? `/admin/users${openParam}` : '/admin/users';
        case 'vehicle':
        case 'vehicles':
          return id ? `/admin/vehicles${openParam}` : '/admin/vehicles';
        case 'driver':
        case 'drivers':
          return id ? `/admin/drivers${openParam}` : '/admin/drivers';
        case 'bus_schedule':
        case 'bus-schedule':
        case 'bus-schedules':
          return '/admin/bus-schedules';
        default:
          return '/admin/dashboard';
      }

    case 'FLEET_MANAGER':
    case 'MANAGER':
      switch (normType) {
        case 'booking':
        case 'bookings':
          return id ? `/manager/bookings${openParam}` : '/manager/bookings';
        case 'trip':
        case 'trips':
          return id ? `/manager/trips${openParam}` : '/manager/trips';
        case 'payment':
        case 'payments':
          return id ? `/manager/payments${openParam}` : '/manager/payments';
        case 'fuel':
          return id ? `/manager/fuel${openParam}` : '/manager/fuel';
        case 'expense':
        case 'expenses':
          return id ? `/manager/expenses${openParam}` : '/manager/expenses';
        case 'document':
        case 'documents':
          return id ? `/manager/documents${openParam}` : '/manager/documents';
        case 'vehicle':
        case 'vehicles':
          return id ? `/manager/fleet${openParam}` : '/manager/fleet';
        case 'driver':
        case 'drivers':
        case 'assignment':
        case 'assignments':
          return id ? `/manager/assignments${openParam}` : '/manager/assignments';
        case 'approval':
        case 'approvals':
          return '/manager/approvals';
        case 'bus_schedule':
        case 'bus-schedule':
        case 'bus-schedules':
          return '/manager/bus-schedules';
        default:
          return '/manager/dashboard';
      }

    case 'DRIVER':
      switch (normType) {
        case 'trip':
        case 'trips':
        case 'booking':
        case 'bookings':
          return id ? `/driver/trips/${id}` : '/driver/trips';
        case 'fuel':
          return id ? `/driver/fuel${openParam}` : '/driver/fuel';
        case 'expense':
        case 'expenses':
          return id ? `/driver/expenses${openParam}` : '/driver/expenses';
        case 'document':
        case 'documents':
          return id ? `/driver/documents${openParam}` : '/driver/documents';
        case 'payment':
        case 'payments':
          return id ? `/driver/trips/${id}/payment` : '/driver/trips';
        default:
          return '/driver/dashboard';
      }

    case 'CUSTOMER':
      switch (normType) {
        case 'booking':
        case 'bookings':
          return id ? `/customer/bookings/${id}` : '/customer/bookings';
        case 'payment':
        case 'payments':
          return id ? `/customer/payments/${id}/receipt` : '/customer/payments';
        case 'trip':
        case 'trips':
          return id ? `/customer/bookings/${id}` : '/customer/bookings';
        default:
          return '/customer/dashboard';
      }

    default:
      return '/login';
  }
}
