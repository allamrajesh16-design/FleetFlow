import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Logo from '../common/Logo';
import Button from '../common/Button';
import IconButton from '../common/IconButton';
import LogoutDialog from '../common/LogoutDialog';
import {
  DashboardIcon,
  UsersIcon,
  VehicleIcon,
  DriverIcon,
  BookingIcon,
  TripIcon,
  PaymentIcon,
  ReportIcon,
  SettingsIcon,
  LogoutIcon,
  CloseIcon,
  CheckCircleIcon,
  BusIcon,
  FuelIcon,
  ReceiptIcon,
  DocumentIcon,
  ChevronLeftIcon,
} from '../common/Icons';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

export default function Sidebar({
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse = null,
}) {
  const { role } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Menu items per role strictly matching the approved design screens
  const getNavItems = () => {
    const r = String(role).toUpperCase();

    if (r === 'ADMIN') {
      return [
        { label: 'Dashboard', path: '/admin/dashboard', icon: <DashboardIcon size={20} /> },
        { label: 'Users & Roles', path: '/admin/users', icon: <UsersIcon size={20} /> },
        { label: 'Approvals', path: '/admin/approvals', icon: <CheckCircleIcon size={20} /> },
        { label: 'Fleet', path: '/admin/fleet', icon: <VehicleIcon size={20} /> },
        { label: 'Drivers', path: '/admin/drivers', icon: <DriverIcon size={20} /> },
        { label: 'Bookings', path: '/admin/bookings', icon: <BookingIcon size={20} /> },
        { label: 'Trips', path: '/admin/trips', icon: <TripIcon size={20} /> },
        { label: 'Bus Schedules', path: '/admin/bus-schedules', icon: <BusIcon size={20} /> },
        { label: 'Payments', path: '/admin/payments', icon: <PaymentIcon size={20} /> },
        { label: 'Fuel', path: '/admin/fuel', icon: <FuelIcon size={20} /> },
        { label: 'Expenses', path: '/admin/expenses', icon: <ReceiptIcon size={20} /> },
        { label: 'Documents', path: '/admin/documents', icon: <DocumentIcon size={20} /> },
        { label: 'Reports', path: '/admin/reports', icon: <ReportIcon size={20} /> },
        { label: 'Settings', path: '/admin/settings', icon: <SettingsIcon size={20} /> },
      ];
    }

    if (r === 'FLEET_MANAGER') {
      return [
        { label: 'Dashboard', path: '/manager/dashboard', icon: <DashboardIcon size={20} /> },
        { label: 'Approvals', path: '/manager/approvals', icon: <CheckCircleIcon size={20} /> },
        { label: 'Bookings', path: '/manager/bookings', icon: <BookingIcon size={20} /> },
        { label: 'Assignments', path: '/manager/assignments', icon: <UsersIcon size={20} /> },
        { label: 'Trip Monitoring', path: '/manager/trips', icon: <TripIcon size={20} /> },
        { label: 'Bus Monitor', path: '/manager/bus-monitor', icon: <BusIcon size={20} /> },
        { label: 'Fleet', path: '/manager/fleet', icon: <VehicleIcon size={20} /> },
        { label: 'Maintenance', path: '/manager/maintenance', icon: <SettingsIcon size={20} /> },
        { label: 'Fuel', path: '/manager/fuel', icon: <FuelIcon size={20} /> },
        { label: 'Expenses', path: '/manager/expenses', icon: <ReceiptIcon size={20} /> },
        { label: 'Documents', path: '/manager/documents', icon: <DocumentIcon size={20} /> },
        { label: 'Payments', path: '/manager/payments', icon: <PaymentIcon size={20} /> },
        { label: 'Reports', path: '/manager/reports', icon: <ReportIcon size={20} /> },
      ];
    }

    if (r === 'CUSTOMER') {
      return [
        { label: 'Dashboard', path: '/customer/dashboard', icon: <DashboardIcon size={20} /> },
        { label: 'Book a Vehicle', path: '/customer/book', icon: <VehicleIcon size={20} /> },
        { label: 'My Bookings', path: '/customer/bookings', icon: <BookingIcon size={20} /> },
        { label: 'Payments', path: '/customer/payments', icon: <PaymentIcon size={20} /> },
      ];
    }

    // Driver menu items
    return [
      { label: 'Dashboard', path: '/driver/dashboard', icon: <DashboardIcon size={20} /> },
      { label: 'My Trips', path: '/driver/trips', icon: <TripIcon size={20} /> },
      { label: 'Trip History', path: '/driver/history', icon: <BookingIcon size={20} /> },
      { label: 'Fuel', path: '/driver/fuel', icon: <FuelIcon size={20} /> },
      { label: 'Expenses', path: '/driver/expenses', icon: <ReceiptIcon size={20} /> },
      { label: 'Documents', path: '/driver/documents', icon: <DocumentIcon size={20} /> },
    ];
  };

  const location = useLocation();
  const navItems = getNavItems();
  const activeIndex = navItems.findIndex(
    (item) => location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  );

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${isOpen ? 'active' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar-container ${isOpen ? 'open' : ''} ${isCollapsed ? 'rail' : ''}`}>
        {/* Top Header */}
        <div className="sidebar-header">
          <Logo to={null} size={isCollapsed ? 'small' : 'medium'} compact={isCollapsed} />
          <div className="sidebar-header-actions">
            {onToggleCollapse && (
              <IconButton
                icon={
                  <ChevronLeftIcon
                    size={18}
                    style={{
                      transform: isCollapsed ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                }
                ariaLabel={isCollapsed ? 'Expand sidebar' : 'Collapse to rail'}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse to rail'}
                variant="ghost"
                shape="round"
                onClick={onToggleCollapse}
                className="sidebar-rail-toggle desktop-only"
              />
            )}
            <IconButton
              icon={<CloseIcon size={20} />}
              ariaLabel="Close menu"
              title="Close menu"
              variant="ghost"
              shape="round"
              onClick={onClose}
              className="sidebar-close-mobile"
            />
          </div>
        </div>

        {/* Navigation list */}
        <div className="sidebar-nav-wrapper">
          <nav className="sidebar-nav">
            <ul className="sidebar-menu">
              {activeIndex >= 0 && (
                <div
                  className="sidebar-active-indicator"
                  style={{ transform: `translateY(${activeIndex * 42}px)` }}
                  aria-hidden="true"
                />
              )}
              {navItems.map((item, index) => (
                <li
                  key={item.path}
                  className="sidebar-item"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <NavLink
                    to={item.path}
                    onClick={onClose}
                    title={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `sidebar-link ${isActive ? 'active' : ''}`
                    }
                  >
                    <span className="sidebar-icon">{item.icon}</span>
                    {!isCollapsed && <span className="sidebar-label">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-nav-fade" aria-hidden="true" />
        </div>

        {/* Bottom user & Logout */}
        <div className="sidebar-footer">
          {isCollapsed ? (
            <IconButton
              variant="danger"
              shape="round"
              icon={<LogoutIcon size={18} />}
              ariaLabel="Logout"
              title="Logout"
              onClick={() => setShowLogoutConfirm(true)}
              className="sidebar-logout-rail-btn"
            />
          ) : (
            <Button
              type="button"
              variant="danger"
              size="md"
              fullWidth
              icon={<LogoutIcon size={18} />}
              onClick={() => setShowLogoutConfirm(true)}
              className="sidebar-logout-btn"
            >
              Logout
            </Button>
          )}
        </div>
      </aside>

      {/* Logout confirmation dialog */}
      <LogoutDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
      />
    </>
  );
}
