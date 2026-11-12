import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getStoredToken } from '../utils/authStorage';
import ProtectedRoute from './ProtectedRoute';

// Layouts
import DashboardLayout from '../components/layout/DashboardLayout';
import DriverMobileLayout from '../components/layout/DriverMobileLayout';
import PublicLayout from '../components/layout/PublicLayout';

// Public Pages
import LandingPage from '../pages/public/LandingPage';
import LoginPage from '../pages/public/LoginPage';
import RegisterPage from '../pages/public/RegisterPage';
import VerifyOtpPage from '../pages/public/VerifyOtpPage';
import ForgotPasswordPage from '../pages/public/ForgotPasswordPage';
import ResetPasswordPage from '../pages/public/ResetPasswordPage';

// Shared Pages
import ProfilePage from '../pages/shared/ProfilePage';
import NotificationsPage from '../pages/shared/NotificationsPage';
import NotFoundPage from '../pages/shared/NotFoundPage';
import UnauthorizedPage from '../pages/shared/UnauthorizedPage';

// Admin Pages
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import AdminUsersPage from '../pages/admin/AdminUsersPage';
import AdminApprovalsPage from '../pages/admin/AdminApprovalsPage';
import FleetManagementPage from '../pages/shared/FleetManagementPage';
import AdminDriversPage from '../pages/admin/AdminDriversPage';
import AdminBookingsPage from '../pages/admin/AdminBookingsPage';
import AdminTripsPage from '../pages/admin/AdminTripsPage';
import AdminBusSchedulesPage from '../pages/admin/AdminBusSchedulesPage';
import AdminPaymentsPage from '../pages/admin/AdminPaymentsPage';
import AdminReportsPage from '../pages/admin/AdminReportsPage';
import AdminSettingsPage from '../pages/admin/AdminSettingsPage';

// Shared Fuel, Expenses & Documents Pages
import FuelManagementPage from '../pages/shared/FuelManagementPage';
import ExpensesManagementPage from '../pages/shared/ExpensesManagementPage';
import DocumentsManagementPage from '../pages/shared/DocumentsManagementPage';

// Fleet Manager Pages
import ManagerDashboardPage from '../pages/manager/ManagerDashboardPage';
import ManagerApprovalsPage from '../pages/manager/ManagerApprovalsPage';
import ManagerBookingsPage from '../pages/manager/ManagerBookingsPage';
import ManagerAssignmentsPage from '../pages/manager/ManagerAssignmentsPage';
import ManagerCreateAssignmentPage from '../pages/manager/ManagerCreateAssignmentPage';
import ManagerAssignmentDetailsPage from '../pages/manager/ManagerAssignmentDetailsPage';
import ManagerBusMonitorPage from '../pages/manager/ManagerBusMonitorPage';
import ManagerMaintenancePage from '../pages/manager/ManagerMaintenancePage';
import ManagerPaymentsPage from '../pages/manager/ManagerPaymentsPage';
import ManagerReportsPage from '../pages/manager/ManagerReportsPage';

// Driver Pages
import DriverDashboardPage from '../pages/driver/DriverDashboardPage';
import DriverMyTripsPage from '../pages/driver/DriverMyTripsPage';
import DriverTripDetailsPage from '../pages/driver/DriverTripDetailsPage';
import DriverStartTripPage from '../pages/driver/DriverStartTripPage';
import DriverCompleteTripPage from '../pages/driver/DriverCompleteTripPage';
import DriverPaymentQrPage from '../pages/driver/DriverPaymentQrPage';
import DriverTripHistoryPage from '../pages/driver/DriverTripHistoryPage';
import DriverFuelPage from '../pages/driver/DriverFuelPage';
import DriverExpensesPage from '../pages/driver/DriverExpensesPage';
import DriverDocumentsPage from '../pages/driver/DriverDocumentsPage';

// Customer Pages
import CustomerDashboardPage from '../pages/customer/CustomerDashboardPage';
import CustomerVehicleSelectPage from '../pages/customer/CustomerVehicleSelectPage';
import CustomerBookingFormPage from '../pages/customer/CustomerBookingFormPage';
import CustomerBikeBookingPage from '../pages/customer/CustomerBikeBookingPage';
import CustomerCarBookingPage from '../pages/customer/CustomerCarBookingPage';
import CustomerBusBookingPage from '../pages/customer/CustomerBusBookingPage';
import CustomerMyBookingsPage from '../pages/customer/CustomerMyBookingsPage';
import CustomerBookingDetailsPage from '../pages/customer/CustomerBookingDetailsPage';
import CustomerLiveTrackingPage from '../pages/customer/CustomerLiveTrackingPage';
import CustomerPaymentHistoryPage from '../pages/customer/CustomerPaymentHistoryPage';
import CustomerPaymentPage from '../pages/customer/CustomerPaymentPage';
import CustomerPaymentReceiptPage from '../pages/customer/CustomerPaymentReceiptPage';

// Dev Motion testbench (lazy loaded, separate chunk)
const DevMotionPage = React.lazy(() => import('../pages/public/DevMotionPage'));


function NotFoundOrLogin() {
  const location = useLocation();
  const hasToken = !!getStoredToken('fleetflow_access_token');
  if (!hasToken) {
    return <Navigate to="/login" state={{ from: location, message: 'Please login to continue.' }} replace />;
  }
  return <NotFoundPage />;
}

function UnauthorizedOrLogin() {
  const location = useLocation();
  const hasToken = !!getStoredToken('fleetflow_access_token');
  if (!hasToken) {
    return <Navigate to="/login" state={{ from: location, message: 'Please login to continue.' }} replace />;
  }
  return <UnauthorizedPage />;
}

// Wrapper that picks DriverMobileLayout for drivers and DashboardLayout for other roles
function SharedLayoutWrapper() {
  const { role, user } = useAuth();
  const sessionKey = user?.id ? `session-${user.id}` : 'no-session';
  if (String(role).toUpperCase() === 'DRIVER') {
    return <DriverMobileLayout key={`driver-shared-${sessionKey}`} />;
  }
  return <DashboardLayout key={`dashboard-shared-${sessionKey}`} />;
}

export default function AppRoutes() {
  const { user } = useAuth();
  const sessionKey = user?.id ? `session-${user.id}` : 'no-session';

  return (
    <Routes>
      {/* Public Pages */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/register"
          element={<RegisterPage />}
        />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/forgot-password/verify" element={<Navigate to="/forgot-password" replace />} />
        <Route path="/forgot-password/new-password" element={<Navigate to="/forgot-password" replace />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/dev/motion"
          element={
            <React.Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Loading motion bench...</div>}>
              <DevMotionPage />
            </React.Suspense>
          }
        />
      </Route>

      {/* Shared Protected Pages (All logged-in roles) */}
      <Route
        element={
          <ProtectedRoute>
            <SharedLayoutWrapper />
          </ProtectedRoute>
        }
      >
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      {/* Admin Role Area */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <DashboardLayout key={`admin-${sessionKey}`} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="approvals" element={<AdminApprovalsPage />} />
        <Route path="fleet" element={<FleetManagementPage />} />
        <Route path="vehicles" element={<Navigate to="/admin/fleet" replace />} />
        <Route path="drivers" element={<AdminDriversPage />} />
        <Route path="bookings" element={<AdminBookingsPage />} />
        <Route path="trips" element={<AdminTripsPage />} />
        <Route path="bus-schedules" element={<AdminBusSchedulesPage />} />
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="maintenance" element={<ManagerMaintenancePage />} />
        <Route path="fuel" element={<FuelManagementPage />} />
        <Route path="expenses" element={<ExpensesManagementPage />} />
        <Route path="documents" element={<DocumentsManagementPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      {/* Fleet Manager Role Area */}
      <Route
        path="/manager"
        element={
          <ProtectedRoute allowedRoles={['FLEET_MANAGER']}>
            <DashboardLayout key={`manager-${sessionKey}`} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/manager/dashboard" replace />} />
        <Route path="dashboard" element={<ManagerDashboardPage />} />
        <Route path="approvals" element={<ManagerApprovalsPage />} />
        <Route path="bookings" element={<ManagerBookingsPage />} />
        <Route path="assignments" element={<ManagerAssignmentsPage />} />
        <Route path="assignments/new" element={<ManagerCreateAssignmentPage />} />
        <Route path="assignments/new/:bookingId" element={<ManagerCreateAssignmentPage />} />
        <Route path="assignments/:id" element={<ManagerAssignmentDetailsPage />} />
        <Route path="trips" element={<Navigate to="/manager/assignments" replace />} />
        <Route path="bus-monitor" element={<ManagerBusMonitorPage />} />
        <Route path="bus-schedules" element={<AdminBusSchedulesPage />} />
        <Route path="fleet" element={<FleetManagementPage />} />
        <Route path="vehicles" element={<Navigate to="/manager/fleet" replace />} />
        <Route path="drivers" element={<AdminDriversPage />} />
        <Route path="maintenance" element={<ManagerMaintenancePage />} />
        <Route path="fuel" element={<FuelManagementPage />} />
        <Route path="expenses" element={<ExpensesManagementPage />} />
        <Route path="documents" element={<DocumentsManagementPage />} />
        <Route path="payments" element={<ManagerPaymentsPage />} />
        <Route path="reports" element={<ManagerReportsPage />} />
      </Route>

      {/* Fleet alias redirect */}
      <Route path="/fleet/*" element={<Navigate to="/manager" replace />} />

      {/* Driver Role Area (Mobile App Layout) */}
      <Route
        path="/driver"
        element={
          <ProtectedRoute allowedRoles={['DRIVER']}>
            <DriverMobileLayout key={`driver-${sessionKey}`} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/driver/dashboard" replace />} />
        <Route path="dashboard" element={<DriverDashboardPage />} />
        <Route path="trips" element={<DriverMyTripsPage />} />
        <Route path="trips/:id" element={<DriverTripDetailsPage />} />
        <Route path="trips/:id/start" element={<DriverStartTripPage />} />
        <Route path="trips/:id/complete" element={<DriverCompleteTripPage />} />
        <Route path="trips/:id/payment" element={<DriverPaymentQrPage />} />
        <Route path="history" element={<DriverTripHistoryPage />} />
        <Route path="fuel" element={<DriverFuelPage />} />
        <Route path="expenses" element={<DriverExpensesPage />} />
        <Route path="documents" element={<DriverDocumentsPage />} />
        <Route path="profile" element={<Navigate to="/profile" replace />} />
        <Route path="notifications" element={<Navigate to="/notifications" replace />} />
      </Route>

      {/* Customer Role Area */}
      <Route
        path="/customer"
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <DashboardLayout key={`customer-${sessionKey}`} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/customer/dashboard" replace />} />
        <Route path="dashboard" element={<CustomerDashboardPage />} />
        <Route path="book" element={<CustomerVehicleSelectPage />} />
        <Route path="book/vehicle" element={<CustomerBookingFormPage />} />
        <Route path="book/bike" element={<CustomerBikeBookingPage />} />
        <Route path="book/car" element={<CustomerCarBookingPage />} />
        <Route path="book/bus" element={<CustomerBusBookingPage />} />
        <Route path="bookings" element={<CustomerMyBookingsPage />} />
        <Route path="bookings/:id" element={<CustomerBookingDetailsPage />} />
        <Route path="bookings/:id/track" element={<CustomerLiveTrackingPage />} />
        <Route path="payments" element={<CustomerPaymentHistoryPage />} />
        <Route path="payments/:id/pay" element={<CustomerPaymentPage />} />
        <Route path="payments/:id/receipt" element={<CustomerPaymentReceiptPage />} />
        <Route path="notifications" element={<Navigate to="/notifications" replace />} />
        <Route path="profile" element={<Navigate to="/profile" replace />} />
      </Route>

      {/* Status & Error Pages */}
      <Route path="/unauthorized" element={<UnauthorizedOrLogin />} />
      <Route path="/404" element={<NotFoundOrLogin />} />
      <Route path="*" element={<NotFoundOrLogin />} />
    </Routes>
  );
}
