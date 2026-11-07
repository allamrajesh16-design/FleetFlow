import AuroraBackground from "../../components/common/AuroraBackground";
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import { useAuth, getHomePath } from '../../context/AuthContext';
import './StatusPages.css';

function formatRoleName(r) {
  if (!r) return '';
  switch (String(r).toUpperCase()) {
    case 'ADMIN':
      return 'Admin';
    case 'FLEET_MANAGER':
      return 'Fleet Manager';
    case 'DRIVER':
      return 'Driver';
    case 'CUSTOMER':
      return 'Customer';
    default:
      return r;
  }
}

export default function UnauthorizedPage() {
  const { role, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const blockedPath = location.state?.from || '';
  const allowedRoles = location.state?.allowedRoles || [];

  const targetRoles =
    allowedRoles.length > 0
      ? allowedRoles.map(formatRoleName).join(', ')
      : 'Admin';

  const currentRole = String(role || user?.role || '').toUpperCase();
  const currentRoleName = formatRoleName(currentRole) || 'User';

  const isStaff = ['ADMIN', 'FLEET_MANAGER', 'DRIVER'].includes(currentRole);
  const showAddress = isStaff && Boolean(blockedPath);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(getHomePath(role), { replace: true });
    }
  };

  const handleSignOut = async () => {
    try {
      await logout({ userInitiated: true });
    } catch (e) {
      navigate('/login', { replace: true });
    }
  };

  return (
    <>
      <AuroraBackground />
      <div className="status-page-container fade-in">
      <div className="status-page-card">
        <div className="status-logo-wrapper">
          <Logo size="medium" />
        </div>

        <div className="status-code text-danger">403</div>
        <h1 className="status-title">Access Restricted</h1>
        <p className="status-description">
          You do not have permission to access this area. Your current role does not
          grant access to these resources.
        </p>

        <div className="status-roles-info">
          <p className="status-role-line">
            This page is for: <span className="status-role-highlight">{targetRoles}</span>
          </p>
          <p className="status-role-line">
            You are signed in as: <span className="status-role-highlight">{currentRoleName}</span>
          </p>
          {showAddress && (
            <p className="status-blocked-path">{blockedPath}</p>
          )}
        </div>

        <div className="status-actions">
          <Button
            variant="primary"
            size="medium"
            onClick={() => navigate(getHomePath(role), { replace: true })}
          >
            Go to my dashboard
          </Button>
          <Button
            variant="outline"
            size="medium"
            onClick={handleGoBack}
          >
            Go back
          </Button>
          <Button
            variant="outline"
            size="medium"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  </>
  );
}
