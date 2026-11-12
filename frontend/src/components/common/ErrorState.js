import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from './Button';
import { useAuth, getHomePath } from '../../context/AuthContext';
import './ErrorState.css';

export default function ErrorState({
  title = 'Something went wrong!',
  description = 'Please try again later or check your network connection.',
  message,
  status,
  onRetry,
  retryText = 'Try Again',
  className = '',
}) {
  let navigate = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigate = useNavigate();
  } catch (e) {
    navigate = (path) => {
      if (typeof window !== 'undefined') window.location.href = path;
    };
  }

  let role = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const auth = useAuth();
    role = auth?.role;
  } catch (e) {
    role = null;
  }

  const rawMessage = message || description || '';
  const errorStr = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage);

  const is403 =
    status === 403 ||
    errorStr.includes('403') ||
    errorStr.toLowerCase().includes('permission') ||
    errorStr.toLowerCase().includes('not allowed') ||
    errorStr.toLowerCase().includes('restricted');

  const is401 =
    !is403 &&
    (status === 401 ||
      errorStr.includes('401') ||
      errorStr.toLowerCase().includes('session expired') ||
      errorStr.toLowerCase().includes('unauthorized') ||
      errorStr.toLowerCase().includes('login again'));

  const is404 =
    !is403 &&
    !is401 &&
    (status === 404 ||
      errorStr.includes('404') ||
      errorStr.toLowerCase().includes('not found') ||
      errorStr.toLowerCase().includes('could not be found'));

  const handleDashboardRedirect = () => {
    const dest = getHomePath(role);
    if (navigate) {
      navigate(dest);
    } else if (typeof window !== 'undefined') {
      window.location.href = dest;
    }
  };

  const handleLoginRedirect = () => {
    if (navigate) {
      navigate('/login');
    } else if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  // 403 Screen
  if (is403) {
    return (
      <div className={`error-state-card error-state-403 ${className}`}>
        <div className="error-state-code text-danger">403</div>
        <h3 className="error-state-title">Access Restricted</h3>
        <p className="error-state-desc">You do not have permission to view this data</p>
        <div className="error-state-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleLoginRedirect}
            className="error-state-btn"
          >
            Go to Login
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDashboardRedirect}
            className="error-state-btn"
          >
            Go to my dashboard
          </Button>
        </div>
      </div>
    );
  }

  // 401 Screen
  if (is401) {
    return (
      <div className={`error-state-card error-state-401 ${className}`}>
        <div className="error-state-code text-warning">401</div>
        <h3 className="error-state-title">Session Expired</h3>
        <p className="error-state-desc">Your session has expired. Please login again to continue.</p>
        <div className="error-state-actions">
          <Button
            variant="primary"
            size="sm"
            onClick={handleLoginRedirect}
            className="error-state-btn"
          >
            Login Again
          </Button>
        </div>
      </div>
    );
  }

  // 404 Screen
  if (is404) {
    return (
      <div className={`error-state-card error-state-404 ${className}`}>
        <div className="error-state-code text-muted">404</div>
        <h3 className="error-state-title">Resource Not Found</h3>
        <p className="error-state-desc">
          {rawMessage || 'The requested resource or dataset could not be found.'}
        </p>
        <div className="error-state-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleLoginRedirect}
            className="error-state-btn"
          >
            Go to Login
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDashboardRedirect}
            className="error-state-btn"
          >
            Go to my dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Default Error Screen
  return (
    <div className={`error-state-card ${className}`}>
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="error-state-svg"
      >
        <circle cx="40" cy="40" r="36" fill="var(--danger-bg)" />
        <circle cx="40" cy="40" r="28" fill="var(--danger-bg)" fillOpacity="0.4" />
        <rect x="37.5" y="26" width="5" height="18" rx="2.5" fill="var(--danger)" />
        <circle cx="40" cy="51" r="3" fill="var(--danger)" />
      </svg>

      <h3 className="error-state-title">{title}</h3>
      <p className="error-state-desc">{rawMessage || description}</p>

      {onRetry && (
        <Button variant="primary" size="sm" onClick={onRetry} className="error-state-btn">
          {retryText}
        </Button>
      )}
    </div>
  );
}
