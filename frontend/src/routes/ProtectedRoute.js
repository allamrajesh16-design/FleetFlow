import React, { useEffect, useState, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getStoredToken } from '../utils/authStorage';
import { PageLoader } from '../components/common/Loader';

/**
 * Route wrapper that enforces authentication and optional role restrictions.
 * - Re-reads tokens directly from storage on every render, route change, focus, pageshow, and popstate.
 * - Listens to 'pageshow' (event.persisted) and 'popstate' so Back/Forward buttons can never expose protected routes after logout.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, isAuthenticated, loading, logout } = useAuth();
  const location = useLocation();
  const [, setTick] = useState(0);

  const verifySession = useCallback(() => {
    const token = getStoredToken('fleetflow_access_token');
    if (!token) {
      if (isAuthenticated) {
        logout({ silent: true });
      }
      return false;
    }
    return true;
  }, [isAuthenticated, logout]);

  // Synchronously verify token presence in storage
  const hasToken = !!getStoredToken('fleetflow_access_token');

  useEffect(() => {
    verifySession();

    const handleRecheck = () => {
      const valid = verifySession();
      if (!valid) {
        setTick((t) => t + 1);
      }
    };

    const handlePageShow = (e) => {
      // e.persisted is true when restored from bfcache
      handleRecheck();
    };

    window.addEventListener('focus', handleRecheck);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('popstate', handleRecheck);

    return () => {
      window.removeEventListener('focus', handleRecheck);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('popstate', handleRecheck);
    };
  }, [location.key, location.pathname, verifySession]);

  if (loading) {
    return <PageLoader message="Checking authorization..." />;
  }

  if (!isAuthenticated || !hasToken) {
    return (
      <Navigate
        to="/login"
        state={{ from: location, message: 'Please login to continue.' }}
        replace
      />
    );
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = String(role || user?.role).toUpperCase();
    const hasRole = allowedRoles.some(
      (r) => String(r).toUpperCase() === userRole
    );

    if (!hasRole) {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        console.warn(
          `[Authorization Guard] Access denied. User role: "${userRole}", Blocked route: "${location.pathname}", Allowed roles: [${allowedRoles.join(', ')}]`
        );
      }
      return (
        <Navigate
          to="/unauthorized"
          state={{
            from: location.pathname + location.search,
            allowedRoles: allowedRoles,
          }}
          replace
        />
      );
    }
  }

  return children;
}
