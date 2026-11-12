import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from '../common/Logo';
import Button from '../common/Button';
import IconButton from '../common/IconButton';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import LogoutDialog from '../common/LogoutDialog';
import {
  DashboardIcon,
  TripIcon,
  BookingIcon,
  BellIcon,
  LogoutIcon,
  FuelIcon,
  ReceiptIcon,
  DocumentIcon,
  SunIcon,
  MoonIcon,
} from '../common/Icons';
import { getNotificationsApi } from '../../api/notifications';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ErrorBoundary from '../common/ErrorBoundary';
import PageTransition from '../common/PageTransition';
import useBreakpoint from '../../hooks/useBreakpoint';
import './DriverMobileLayout.css';
import './DashboardLayout.css';

/**
 * Driver Responsive Layout:
 * - Desktop (>= 1024px) & Tablet (768px - 1023px): Standard Sidebar + Topbar layout (72px rail on tablet)
 * - Mobile (<= 767px): Native-like mobile header + fixed bottom navigation bar
 * Exactly ONE layout root bearing data-layout attribute is rendered.
 */
export default function DriverMobileLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { layout, isPhone, isTablet } = useBreakpoint();

  const getInitials = (name) => {
    if (!name) return 'D';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Close more sheet on route change
  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let isSubscribed = true;
    async function checkNotifications() {
      if (document.hidden) return;
      try {
        const data = await getNotificationsApi();
        const list = Array.isArray(data) ? data : data.results || [];
        const unread = list.filter((n) => !n.is_read).length;
        if (isSubscribed) {
          setUnreadCount(unread);
        }
      } catch (err) {
        // Ignore background polling errors
      }
    }
    checkNotifications();
    const timer = setInterval(checkNotifications, 30000);
    return () => {
      isSubscribed = false;
      clearInterval(timer);
    };
  }, []);

  const isHomeActive =
    location.pathname === '/driver' ||
    location.pathname === '/driver/' ||
    location.pathname === '/driver/dashboard';
  const isTripsActive = location.pathname.startsWith('/driver/trips');
  const isFuelActive = location.pathname.startsWith('/driver/fuel');
  const isExpensesActive = location.pathname.startsWith('/driver/expenses');
  const isMoreActive =
    location.pathname.startsWith('/driver/history') ||
    location.pathname.startsWith('/driver/documents') ||
    location.pathname.startsWith('/notifications') ||
    location.pathname.startsWith('/profile');

  // Desktop (>= 1024px) & Tablet (768px - 1023px): Standard Sidebar + Topbar layout
  if (!isPhone) {
    return (
      <div
        className={`dashboard-layout driver-desktop-layout ${isTablet ? 'sidebar-collapsed' : ''}`}
        data-layout={layout}
      >
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={isTablet}
        />
        <div className="dashboard-main">
          <Topbar
            title="Driver Portal"
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
          <main className="dashboard-content driver-desktop-content fade-in">
            <ErrorBoundary componentName="this page">
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    );
  }

  // Mobile view (<= 767px): Full-width mobile layout with bottom navigation
  return (
    <div className="driver-mobile-view-wrapper" data-layout="phone">
      {/* Mobile Top Header */}
      <header className="driver-header">
        <div className="driver-header-left">
          <Logo size="small" />
        </div>
        <div className="driver-header-right">
          <IconButton
            icon={isDark ? <SunIcon size={20} color="var(--amber-500, #f59e0b)" /> : <MoonIcon size={20} />}
            onClick={toggleTheme}
            ariaLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            variant="ghost"
            shape="round"
            className="driver-header-icon"
          />
          <NavLink
            to="/notifications"
            className="driver-header-icon"
            aria-label="Notifications"
          >
            <BellIcon size={20} />
            {unreadCount > 0 && (
              <span className="driver-bell-badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/profile"
            className="driver-header-avatar"
            aria-label="My Profile"
            title={user?.full_name || user?.name || 'Driver Profile'}
          >
            <div className="topbar-avatar" style={{ width: '36px', height: '36px' }}>
              {getInitials(user?.full_name || user?.name || user?.email)}
            </div>
          </NavLink>
          <IconButton
            icon={<LogoutIcon size={18} />}
            onClick={() => setShowLogoutConfirm(true)}
            ariaLabel="Log out"
            title="Log out"
            variant="ghost"
            shape="round"
            className="driver-header-icon"
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="driver-content">
        <ErrorBoundary componentName="this page">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </ErrorBoundary>
      </main>

      {/* Fixed Bottom Navigation: Home, My Trips, Fuel, Expenses, More */}
      <nav className="driver-bottom-nav">
        <NavLink
          to="/driver/dashboard"
          className={`driver-nav-item ${isHomeActive ? 'active' : ''}`}
        >
          <DashboardIcon size={20} />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/driver/trips"
          className={`driver-nav-item ${isTripsActive ? 'active' : ''}`}
        >
          <TripIcon size={20} />
          <span>Trips</span>
        </NavLink>

        <NavLink
          to="/driver/fuel"
          className={`driver-nav-item ${isFuelActive ? 'active' : ''}`}
        >
          <FuelIcon size={20} />
          <span>Fuel</span>
        </NavLink>

        <NavLink
          to="/driver/expenses"
          className={`driver-nav-item ${isExpensesActive ? 'active' : ''}`}
        >
          <ReceiptIcon size={20} />
          <span>Expenses</span>
        </NavLink>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          className={`driver-nav-item ${isMoreActive && !isMoreOpen ? 'active' : ''}`}
          aria-expanded={isMoreOpen}
          aria-label="More navigation options"
        >
          <div className="driver-nav-dots-icon">
            <span />
            <span />
            <span />
          </div>
          <span>More</span>
        </Button>
      </nav>

      {/* Mobile "More" Drawer Sheet */}
      {isMoreOpen && (
        <>
          <div
            className="driver-more-backdrop"
            onClick={() => setIsMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="driver-more-sheet slide-up">
            <div className="driver-more-handle" />
            <h3 className="driver-more-title">More Options</h3>
            <div className="driver-more-grid">
              <NavLink
                to="/driver/history"
                className="driver-more-item"
                onClick={() => setIsMoreOpen(false)}
              >
                <div className="driver-more-icon-box">
                  <BookingIcon size={22} />
                </div>
                <span>Trip History</span>
              </NavLink>

              <NavLink
                to="/driver/documents"
                className="driver-more-item"
                onClick={() => setIsMoreOpen(false)}
              >
                <div className="driver-more-icon-box">
                  <DocumentIcon size={22} />
                </div>
                <span>Documents</span>
              </NavLink>

              <NavLink
                to="/profile"
                className="driver-more-item"
                onClick={() => setIsMoreOpen(false)}
              >
                <div className="driver-more-icon-box">
                  <div className="topbar-avatar" style={{ width: '24px', height: '24px', fontSize: '11px' }}>
                    {getInitials(user?.full_name || user?.name || user?.email)}
                  </div>
                </div>
                <span>My Profile</span>
              </NavLink>

              <NavLink
                to="/notifications"
                className="driver-more-item"
                onClick={() => setIsMoreOpen(false)}
              >
                <div className="driver-more-icon-box">
                  <BellIcon size={22} />
                  {unreadCount > 0 && <span className="driver-more-badge" />}
                </div>
                <span>Notifications</span>
              </NavLink>
            </div>
            <div className="driver-more-footer">
              <Button
                variant="outline"
                size="md"
                className="driver-more-logout-btn"
                onClick={() => {
                  setIsMoreOpen(false);
                  setShowLogoutConfirm(true);
                }}
                leftIcon={<LogoutIcon size={18} />}
              >
                Log Out
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Logout Confirmation Dialog */}
      <LogoutDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}
