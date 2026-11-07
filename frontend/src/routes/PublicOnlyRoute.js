import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, getHomePath } from '../context/AuthContext';
import { PageLoader } from '../components/common/Loader';

/**
 * For guest-only pages like /login, /register, etc.
 * Logged-in users are redirected to their role-specific dashboard.
 */
export default function PublicOnlyRoute({ children }) {
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) {
    return <PageLoader message="Loading..." />;
  }

  if (isAuthenticated) {
    return <Navigate to={getHomePath(role)} replace />;
  }

  return children;
}
