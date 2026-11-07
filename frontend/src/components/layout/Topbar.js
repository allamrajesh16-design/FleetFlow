import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../common/Button';
import IconButton from '../common/IconButton';
import Logo from '../common/Logo';
import LogoutDialog from '../common/LogoutDialog';
import {
  BellIcon,
  LogoutIcon,
  SettingsIcon,
  SearchIcon,
  CloseIcon,
  VehicleIcon,
  TripIcon,
  UsersIcon,
  DriverIcon,
  ReceiptIcon,
  SunIcon,
  MoonIcon,
  ChevronLeftIcon,
} from '../common/Icons';
import { SearchInput } from '../forms';
import apiClient from '../../api/client';
import { getNotificationsApi } from '../../api/notifications';
import { getDetailPath } from '../../utils/navigation';
import './Topbar.css';

export default function Topbar({ onToggleSidebar, title, hideSidebarToggle = false }) {
  const { user, role } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const getHomeRoute = useCallback(() => {
    const r = String(role || user?.role || '').toUpperCase();
    if (r === 'ADMIN') return '/admin/dashboard';
    if (r === 'FLEET_MANAGER') return '/manager/dashboard';
    if (r === 'DRIVER') return '/driver/dashboard';
    if (r === 'CUSTOMER') return '/customer/dashboard';
    return '/';
  }, [role, user]);

  const isNavHidden = hideSidebarToggle;

  const getSearchPlaceholder = () => {
    const r = String(role || '').toUpperCase();
    if (r === 'DRIVER') return 'Search trips, expenses...';
    if (r === 'CUSTOMER') return 'Search my bookings...';
    return 'Search bookings, vehicles...';
  };

  const [unreadCount, setUnreadCount] = useState(0);
  const [bellSwinging, setBellSwinging] = useState(false);
  const prevUnreadRef = useRef(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 5);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBellSwinging(true);
      const timer = setTimeout(() => setBellSwinging(false), 1000);
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // Quick search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const mobileSearchInputRef = useRef(null);

  // Fetch unread notifications count
  useEffect(() => {
    let isMounted = true;
    const fetchUnread = async () => {
      if (document.hidden) return;
      try {
        const data = await getNotificationsApi();
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        const count = list.filter((item) => !item.is_read).length;
        setUnreadCount(count);
      } catch (err) {
        // Silent catch for topbar count
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const formatRole = (r) => {
    if (!r) return 'User';
    switch (String(r).toUpperCase()) {
      case 'ADMIN':
        return 'Administrator';
      case 'FLEET_MANAGER':
        return 'Fleet Manager';
      case 'DRIVER':
        return 'Driver';
      case 'CUSTOMER':
        return 'Customer';
      default:
        return r;
    }
  };

  // Perform multi-group search based on user role
  const performSearch = useCallback(
    async (term) => {
      const q = term?.trim();
      if (!q) {
        setSearchResults([]);
        setShowDropdown(false);
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);
      const userRole = String(role || '').toUpperCase();
      const groups = [];

      try {
        if (userRole === 'ADMIN') {
          const [uRes, vRes, dRes, bRes, tRes] = await Promise.allSettled([
            apiClient.get('/users/', { params: { search: q, page_size: 5 } }),
            apiClient.get('/vehicles/', { params: { search: q, page_size: 5 } }),
            apiClient.get('/drivers/', { params: { search: q, page_size: 5 } }),
            apiClient.get('/bookings/', { params: { search: q, page_size: 5 } }),
            apiClient.get('/trips/', { params: { search: q, page_size: 5 } }),
          ]);

          const users = uRes.status === 'fulfilled' ? uRes.value.data?.results || uRes.value.data || [] : [];
          const vehicles = vRes.status === 'fulfilled' ? vRes.value.data?.results || vRes.value.data || [] : [];
          const drivers = dRes.status === 'fulfilled' ? dRes.value.data?.results || dRes.value.data || [] : [];
          const bookings = bRes.status === 'fulfilled' ? bRes.value.data?.results || bRes.value.data || [] : [];
          const trips = tRes.status === 'fulfilled' ? tRes.value.data?.results || tRes.value.data || [] : [];

          if (users.length > 0) {
            groups.push({
              title: 'Users',
              icon: <UsersIcon size={16} />,
              items: users.slice(0, 5).map((u) => ({
                id: `user-${u.id}`,
                title: u.full_name || u.email,
                subtitle: `${u.role} • ${u.email}`,
                path: `/admin/users`,
              })),
            });
          }

          if (vehicles.length > 0) {
            groups.push({
              title: 'Vehicles',
              icon: <VehicleIcon size={16} />,
              items: vehicles.slice(0, 5).map((v) => ({
                id: `veh-${v.id}`,
                title: v.registration_number,
                subtitle: `${v.brand || ''} ${v.model || ''} (${v.type || 'Vehicle'})`,
                path: `/admin/vehicles`,
              })),
            });
          }

          if (drivers.length > 0) {
            groups.push({
              title: 'Drivers',
              icon: <DriverIcon size={16} />,
              items: drivers.slice(0, 5).map((d) => ({
                id: `driver-${d.id}`,
                title: d.full_name || d.user?.full_name || d.user?.email || `Driver #${d.id}`,
                subtitle: `Lic: ${d.license_number || 'N/A'} • ${d.status || 'Active'}`,
                path: `/admin/drivers`,
              })),
            });
          }

          if (bookings.length > 0) {
            groups.push({
              title: 'Bookings',
              icon: <TripIcon size={16} />,
              items: bookings.slice(0, 5).map((b) => ({
                id: `book-${b.id}`,
                title: `Booking #${b.id}: ${b.source || 'Origin'} → ${b.destination || 'Destination'}`,
                subtitle: `${b.status || 'Confirmed'} • ${b.customer_name || b.vehicle_registration || ''}`,
                path: getDetailPath('ADMIN', 'booking', b.id),
              })),
            });
          }

          if (trips.length > 0) {
            groups.push({
              title: 'Trips',
              icon: <TripIcon size={16} />,
              items: trips.slice(0, 5).map((t) => ({
                id: `trip-${t.id}`,
                title: `Trip #${t.id}: ${t.source || 'Origin'} → ${t.destination || 'Destination'}`,
                subtitle: `${t.status || 'Scheduled'} • ${t.vehicle_registration || ''}`,
                path: getDetailPath('ADMIN', 'trip', t.id),
              })),
            });
          }
        } else if (userRole === 'FLEET_MANAGER') {
          const [bRes, vRes, dRes, tRes] = await Promise.allSettled([
            apiClient.get('/bookings/', { params: { search: q, page_size: 5 } }),
            apiClient.get('/vehicles/', { params: { search: q, page_size: 5 } }),
            apiClient.get('/drivers/', { params: { search: q, page_size: 5 } }),
            apiClient.get('/trips/', { params: { search: q, page_size: 5 } }),
          ]);

          const bookings = bRes.status === 'fulfilled' ? bRes.value.data?.results || bRes.value.data || [] : [];
          const vehicles = vRes.status === 'fulfilled' ? vRes.value.data?.results || vRes.value.data || [] : [];
          const drivers = dRes.status === 'fulfilled' ? dRes.value.data?.results || dRes.value.data || [] : [];
          const trips = tRes.status === 'fulfilled' ? tRes.value.data?.results || tRes.value.data || [] : [];

          if (bookings.length > 0) {
            groups.push({
              title: 'Bookings',
              icon: <TripIcon size={16} />,
              items: bookings.slice(0, 5).map((b) => ({
                id: `book-${b.id}`,
                title: `Booking #${b.id}: ${b.source || 'Origin'} → ${b.destination || 'Destination'}`,
                subtitle: `${b.status || 'Confirmed'} • ${b.customer_name || b.vehicle_registration || ''}`,
                path: getDetailPath('FLEET_MANAGER', 'booking', b.id),
              })),
            });
          }

          if (vehicles.length > 0) {
            groups.push({
              title: 'Vehicles',
              icon: <VehicleIcon size={16} />,
              items: vehicles.slice(0, 5).map((v) => ({
                id: `veh-${v.id}`,
                title: v.registration_number,
                subtitle: `${v.brand || ''} ${v.model || ''}`,
                path: `/manager/fleet`,
              })),
            });
          }

          if (drivers.length > 0) {
            groups.push({
              title: 'Drivers',
              icon: <DriverIcon size={16} />,
              items: drivers.slice(0, 5).map((d) => ({
                id: `driver-${d.id}`,
                title: d.full_name || d.user?.full_name || d.user?.email || `Driver #${d.id}`,
                subtitle: `Lic: ${d.license_number || 'N/A'} • ${d.status || 'Active'}`,
                path: `/manager/fleet`,
              })),
            });
          }

          if (trips.length > 0) {
            groups.push({
              title: 'Trips',
              icon: <TripIcon size={16} />,
              items: trips.slice(0, 5).map((t) => ({
                id: `trip-${t.id}`,
                title: `Trip #${t.id}: ${t.source || 'Origin'} → ${t.destination || 'Destination'}`,
                subtitle: `${t.status || 'Scheduled'} • ${t.vehicle_registration || ''}`,
                path: getDetailPath('FLEET_MANAGER', 'trip', t.id),
              })),
            });
          }
        } else if (userRole === 'DRIVER') {
          const [tRes, eRes] = await Promise.allSettled([
            apiClient.get('/trips/my-trips/', { params: { search: q, page_size: 5 } }),
            apiClient.get('/expenses/', { params: { search: q, page_size: 5 } }),
          ]);
          const trips = tRes.status === 'fulfilled' ? tRes.value.data?.results || tRes.value.data || [] : [];
          const expenses = eRes.status === 'fulfilled' ? eRes.value.data?.results || eRes.value.data || [] : [];

          if (trips.length > 0) {
            groups.push({
              title: 'My Trips',
              icon: <TripIcon size={16} />,
              items: trips.slice(0, 5).map((t) => ({
                id: `trip-${t.id}`,
                title: `Trip #${t.id}: ${t.pickup_location || t.source || 'Origin'} → ${t.drop_location || t.destination || 'Destination'}`,
                subtitle: `${t.status || 'Scheduled'} • ${t.vehicle_registration || ''}`,
                path: getDetailPath('DRIVER', 'trip', t.id),
              })),
            });
          }

          if (expenses.length > 0) {
            groups.push({
              title: 'My Expenses',
              icon: <ReceiptIcon size={16} />,
              items: expenses.slice(0, 5).map((e) => ({
                id: `exp-${e.id}`,
                title: `${e.category || 'Expense'} - ₹${e.amount || 0}`,
                subtitle: `${e.status || 'PENDING'} • ${e.date || ''}`,
                path: `/driver/expenses`,
              })),
            });
          }
        } else if (userRole === 'CUSTOMER') {
          const bRes = await apiClient.get('/bookings/', { params: { search: q, page_size: 5 } }).catch(() => null);
          const bookings = bRes?.data?.results || bRes?.data || [];
          if (bookings.length > 0) {
            groups.push({
              title: 'My Bookings',
              icon: <TripIcon size={16} />,
              items: bookings.slice(0, 5).map((b) => ({
                id: `book-${b.id}`,
                title: `Booking #${b.id}: ${b.source || 'Origin'} → ${b.destination || 'Destination'}`,
                subtitle: `${b.status || 'Confirmed'} • ${b.vehicle_registration || ''}`,
                path: getDetailPath('CUSTOMER', 'booking', b.id),
              })),
            });
          }
        }

        setSearchResults(groups);
        setShowDropdown(true);
        setSelectedIndex(-1);
      } catch (err) {
        setSearchResults([]);
        setShowDropdown(true);
      } finally {
        setSearchLoading(false);
      }
    },
    [role]
  );

  // Flatten items for arrow key navigation
  const allItems = searchResults.flatMap((g) => g.items);

  const handleSelectResult = (item) => {
    if (!item) return;
    setShowDropdown(false);
    setSearchQuery('');
    setMobileSearchOpen(false);
    navigate(item.path);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < allItems.length) {
        handleSelectResult(allItems[selectedIndex]);
      } else if (allItems.length > 0) {
        handleSelectResult(allItems[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      setSelectedIndex(-1);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <header className={`topbar ${isScrolled ? 'topbar-scrolled' : ''}`}>
        <div className="topbar-left">
          {isNavHidden ? (
            <div className="topbar-brand-section" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconButton
                icon={<ChevronLeftIcon size={20} />}
                onClick={() => {
                  if (window.history.length > 1) {
                    navigate(-1);
                  } else {
                    navigate(getHomeRoute());
                  }
                }}
                ariaLabel="Go back"
                title="Go back"
                variant="ghost"
                shape="round"
                className="topbar-back-btn"
              />
              <Logo to={getHomeRoute()} size="small" />
            </div>
          ) : (
            <IconButton
              icon={
                <span className="hamburger-box">
                  <span className="hamburger-line"></span>
                  <span className="hamburger-line"></span>
                  <span className="hamburger-line"></span>
                </span>
              }
              onClick={onToggleSidebar}
              ariaLabel="Toggle navigation menu"
              title="Toggle navigation menu"
              variant="ghost"
              shape="round"
              className="topbar-toggle-btn"
            />
          )}

          {title && <h1 className="topbar-title">{title}</h1>}
        </div>

        <div className="topbar-right">
          {/* Desktop Search bar with quick-search dropdown */}
          <div className="topbar-search" ref={searchContainerRef}>
            <SearchInput
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => {
                const val = typeof e === 'string' ? e : e?.target?.value || '';
                setSearchQuery(val);
                if (!val.trim()) {
                  setShowDropdown(false);
                  setSearchResults([]);
                }
              }}
              onSearch={performSearch}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (searchQuery.trim() && searchResults.length > 0) {
                  setShowDropdown(true);
                }
              }}
              placeholder={getSearchPlaceholder()}
              aria-label={getSearchPlaceholder()}
              loading={searchLoading}
            />

            {/* Dropdown Results */}
            {showDropdown && (
              <div className="topbar-search-dropdown" role="listbox">
                {allItems.length === 0 ? (
                  <div className="topbar-search-empty">
                    {searchLoading ? 'Searching...' : `No matching results found for "${searchQuery}"`}
                  </div>
                ) : (
                  searchResults.map((group) => (
                    <div key={group.title} className="topbar-search-group">
                      <div className="topbar-search-group-header">
                        {group.icon}
                        <span>{group.title}</span>
                      </div>
                      <div className="topbar-search-group-items">
                        {group.items.map((item) => {
                          const itemGlobalIndex = allItems.findIndex((it) => it.id === item.id);
                          const isSelected = itemGlobalIndex === selectedIndex;
                          return (
                            <div
                              key={item.id}
                              className={`topbar-search-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => handleSelectResult(item)}
                              onMouseEnter={() => setSelectedIndex(itemGlobalIndex)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSelectResult(item);
                              }}
                              role="option"
                              tabIndex={0}
                              aria-selected={isSelected}
                            >
                              <div className="topbar-search-item-title">{item.title}</div>
                              <div className="topbar-search-item-subtitle">{item.subtitle}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Mobile Search Icon Toggle (visible on screens <= 768px / 360px) */}
          <IconButton
            icon={<SearchIcon size={20} />}
            onClick={() => {
              setMobileSearchOpen(!mobileSearchOpen);
              setTimeout(() => {
                if (mobileSearchInputRef.current) {
                  mobileSearchInputRef.current.focus();
                }
              }, 50);
            }}
            ariaLabel="Search"
            title="Search"
            variant="ghost"
            shape="round"
            className="topbar-mobile-search-toggle"
          />

          {/* Theme Toggle Button (Light / Dark) */}
          <IconButton
            icon={isDark ? <SunIcon size={20} color="var(--amber-500, #f59e0b)" /> : <MoonIcon size={20} />}
            onClick={toggleTheme}
            ariaLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            variant="ghost"
            shape="round"
            className="topbar-icon-btn topbar-theme-toggle"
          />

          {/* Notifications Icon with Badge */}
          <Link
            to="/notifications"
            className={`topbar-icon-btn ${bellSwinging ? 'topbar-bell-swing' : ''}`}
            aria-label={`Notifications (${unreadCount} unread)`}
            title="Notifications"
          >
            <BellIcon size={20} />
            {unreadCount > 0 && (
              <span className={`topbar-badge ${bellSwinging ? 'topbar-badge-pop' : ''}`}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          {/* User profile dropdown pill */}
          <div className="topbar-user-wrapper">
            <Button
              type="button"
              variant="ghost"
              className="topbar-user-btn"
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-expanded={showUserMenu}
              aria-label="User account menu"
              title={user?.full_name || user?.name || 'My Account'}
            >
              <div className="topbar-avatar">
                {getInitials(user?.full_name || user?.name || user?.email)}
              </div>
              <div className="topbar-user-info">
                <span className="topbar-user-name" title={user?.full_name || user?.name || 'My Account'}>
                  {user?.full_name || user?.name || 'My Account'}
                </span>
                <span className="topbar-user-role" title={formatRole(role || user?.role)}>
                  {formatRole(role || user?.role)}
                </span>
              </div>
            </Button>

            {showUserMenu && (
              <div className="topbar-dropdown">
                <div className="topbar-dropdown-header">
                  <div className="topbar-dropdown-name">
                    {user?.full_name || user?.name || 'My Account'}
                  </div>
                  <div className="topbar-dropdown-email">
                    {user?.email || ''}
                  </div>
                </div>
                <div className="topbar-dropdown-divider" />
                <Link
                  to="/profile"
                  className="topbar-dropdown-item"
                  onClick={() => setShowUserMenu(false)}
                >
                  <SettingsIcon size={16} />
                  <span>My Profile</span>
                </Link>
                <div className="topbar-dropdown-divider" />
                <Button
                  type="button"
                  variant="ghost"
                  className="topbar-dropdown-item text-danger"
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowLogoutConfirm(true);
                  }}
                  leftIcon={<LogoutIcon size={16} />}
                >
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Full-width mobile search bar overlay on 360px / mobile screens */}
      {mobileSearchOpen && (
        <div className="topbar-mobile-search-overlay fade-in">
          <div className="topbar-mobile-search-bar">
            <SearchInput
              ref={mobileSearchInputRef}
              value={searchQuery}
              onChange={(e) => {
                const val = typeof e === 'string' ? e : e?.target?.value || '';
                setSearchQuery(val);
                if (!val.trim()) {
                  setShowDropdown(false);
                  setSearchResults([]);
                }
              }}
              onSearch={performSearch}
              onKeyDown={handleKeyDown}
              placeholder={getSearchPlaceholder()}
              aria-label={getSearchPlaceholder()}
              loading={searchLoading}
              autoFocus
            />
            <IconButton
              icon={<CloseIcon size={18} />}
              onClick={() => {
                setMobileSearchOpen(false);
                setShowDropdown(false);
              }}
              ariaLabel="Close search"
              title="Close search"
              variant="ghost"
              shape="round"
            />
          </div>

          {/* Mobile search dropdown results */}
          {showDropdown && (
            <div className="topbar-mobile-search-results">
              {allItems.length === 0 ? (
                <div className="topbar-search-empty">
                  {searchLoading ? 'Searching...' : `No matching results found for "${searchQuery}"`}
                </div>
              ) : (
                searchResults.map((group) => (
                  <div key={group.title} className="topbar-search-group">
                    <div className="topbar-search-group-header">
                      {group.icon}
                      <span>{group.title}</span>
                    </div>
                    <div className="topbar-search-group-items">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="topbar-search-item"
                          onClick={() => handleSelectResult(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSelectResult(item);
                          }}
                          role="option"
                          tabIndex={0}
                          aria-selected={false}
                        >
                          <div className="topbar-search-item-title">{item.title}</div>
                          <div className="topbar-search-item-subtitle">{item.subtitle}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Logout confirmation dialog */}
      <LogoutDialog
        isOpen={showLogoutConfirm}
        onClose={() => {
          setShowLogoutConfirm(false);
          setShowUserMenu(false);
        }}
      />
    </>
  );
}
