import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Button from '../../components/common/Button';
import { TextInput, PasswordInput, Checkbox } from '../../components/forms';
import { useAuth, getHomePath } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { MESSAGES } from '../../constants/messages';
import AuthSidePanel, { AuthMobileHeader } from '../../components/auth/AuthSidePanel';
import images from '../../config/images';
import './AuthPages.css';

function formatRole(role) {
  if (!role) return '';
  switch (String(role).toUpperCase()) {
    case 'ADMIN':
      return 'Admin';
    case 'FLEET_MANAGER':
      return 'Fleet Manager';
    case 'DRIVER':
      return 'Driver';
    case 'CUSTOMER':
      return 'Customer';
    default:
      return role;
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, logout, user, isAuthenticated } = useAuth();
  const toast = useToast();

  const [identifier, setIdentifier] = useState(location.state?.prefillEmail || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionAlert, setSessionAlert] = useState(location.state?.message || '');
  const [statusAlert, setStatusAlert] = useState(null); // { type: 'warning'|'error', title, message }

  const roleBanner = (() => {
    if (!location.state?.verifiedSuccess && !location.state?.prefillEmail) return null;
    const r = String(location.state?.role || '').toUpperCase();
    if (r === 'CUSTOMER') {
      return 'Registration complete. Please login.';
    }
    if (r === 'FLEET_MANAGER' || r === 'DRIVER') {
      return 'Email verified. Your request is waiting for approval. You can login after it is approved.';
    }
    return 'Registration complete. Please login.';
  })();

  const handleSwitchUser = async () => {
    await logout({ silent: true, showToast: false });
    setIdentifier('');
    setPassword('');
    setError('');
    setStatusAlert(null);
    setSessionAlert('');
  };

  useEffect(() => {
    if (location.state?.prefillEmail) {
      setIdentifier(location.state.prefillEmail);
      setTimeout(() => {
        const pwdInput = document.querySelector('input[type="password"], #password');
        if (pwdInput) {
          pwdInput.focus();
        }
      }, 120);
    }

    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('expired') === '1') {
      setSessionAlert('Your session expired. Please login again.');
    } else if (location.state?.message) {
      setSessionAlert(location.state.message);
    }

    const isLogoutSuccess =
      location.state?.logoutSuccess ||
      (typeof window !== 'undefined' && sessionStorage.getItem('fleetflow_logout_toast'));

    if (isLogoutSuccess) {
      try {
        sessionStorage.removeItem('fleetflow_logout_toast');
      } catch (_) {}
      if (location.state?.logoutSuccess) {
        window.history.replaceState({}, document.title);
      }
      toast?.clearToasts?.();
      toast?.success(MESSAGES.LOGOUT_SUCCESS, 3000);
    }
  }, [location.state, location.search, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatusAlert(null);
    setSessionAlert('');

    if (!identifier.trim()) {
      setError('Please enter your email or phone number.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      if (rememberMe) {
        localStorage.setItem('fleetflow_remember_identifier', identifier.trim());
      } else {
        localStorage.removeItem('fleetflow_remember_identifier');
      }

      const currentPassword = password;
      // Immediately clear password in state to avoid keeping password in memory
      setPassword('');

      const loggedInUser = await login(
        {
          identifier: identifier.trim(),
          password: currentPassword,
        },
        rememberMe
      );

      // Destination after login: always redirect to user's home dashboard as requested
      const destination = getHomePath(loggedInUser?.role);
      const firstName = loggedInUser?.full_name?.split(' ')[0] || loggedInUser?.name || 'User';
      toast?.success(MESSAGES.LOGIN_SUCCESS(firstName));
      navigate(destination, { replace: true });
    } catch (err) {
      // Always clear password field on failure
      setPassword('');

      // Check HTTP 429 Too Many Requests
      if (err.response?.status === 429) {
        const msg = MESSAGES.LOGIN_TOO_MANY_ATTEMPTS;
        setError(msg);
        toast?.error(msg);
        return;
      }

      // Check unverified email
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        toast?.error(MESSAGES.LOGIN_EMAIL_NOT_VERIFIED, 6000, {
          label: 'Verify Email',
          onClick: () =>
            navigate('/verify-otp', {
              state: {
                email: identifier.includes('@') ? identifier.trim() : '',
                message: MESSAGES.LOGIN_EMAIL_NOT_VERIFIED,
              },
            }),
        });
        navigate('/verify-otp', {
          state: {
            email: identifier.includes('@') ? identifier.trim() : '',
            message: MESSAGES.LOGIN_EMAIL_NOT_VERIFIED,
          },
        });
        return;
      }

      // Check approval pending (toast and persistent card)
      if (err.code === 'APPROVAL_PENDING') {
        setStatusAlert({
          type: 'warning',
          title: 'Account Pending Approval',
          message: MESSAGES.LOGIN_APPROVAL_PENDING,
        });
        toast?.warning(MESSAGES.LOGIN_APPROVAL_PENDING);
        return;
      }

      // Check approval rejected (toast and persistent card)
      if (err.code === 'APPROVAL_REJECTED') {
        const reason = err.rejection_reason || err.response?.data?.rejection_reason || '';
        const rejectMsg = MESSAGES.LOGIN_APPROVAL_REJECTED(reason);
        setStatusAlert({
          type: 'error',
          title: 'Account Registration Rejected',
          message: rejectMsg,
        });
        toast?.error(rejectMsg);
        return;
      }

      // Wrong credentials or generic
      const rawDetail = err.response?.data?.detail || err.response?.data?.non_field_errors?.[0];
      const lowerDetail = String(rawDetail || '').toLowerCase();
      let msg = MESSAGES.LOGIN_INVALID_CREDENTIALS;
      if (lowerDetail.includes('inactive')) {
        msg = MESSAGES.LOGIN_INACTIVE;
      }
      setError(msg);
      toast?.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split-container">
      {/* Left Side Hero Panel */}
      <AuthSidePanel
        imageConfig={images.loginSide}
        headline="Welcome back"
        sentence="Smart Fleet, Better Journeys"
        points={[
          'Live trip tracking',
          'Secure QR payments',
          'Smart bus booking',
        ]}
      />

      {/* Right Form Pane */}
      <div className="auth-split-form-pane">
        <AuthMobileHeader sentence="Smart Fleet, Better Journeys" />
        {isAuthenticated && user ? (
          <div className="auth-form-card fade-in">
            <div className="auth-form-header">
              <h1 className="auth-form-title">Already Signed In</h1>
              <p className="auth-form-subtitle">
                You are signed in as <strong>{user.full_name || user.email}</strong> ({formatRole(user.role)})
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '28px' }}>
              <Button
                variant="primary"
                size="large"
                fullWidth
                onClick={() => navigate(getHomePath(user.role), { replace: true })}
              >
                Continue to dashboard
              </Button>
              <Button
                variant="outline"
                size="large"
                fullWidth
                onClick={handleSwitchUser}
              >
                Sign in as a different user
              </Button>
            </div>
          </div>
        ) : (
          <div className="auth-form-card fade-in">
            <div className="auth-form-header">
              <h1 className="auth-form-title">Welcome Back</h1>
              <p className="auth-form-subtitle">
                Login to your account
              </p>
            </div>

            {/* Post-OTP Role Banner */}
            {roleBanner && (
              <div className="auth-alert info">
                <span>{roleBanner}</span>
              </div>
            )}

            {/* Session Expiry or Redirect Notification */}
            {sessionAlert && (
              <div className="auth-alert warning">
                <span>{sessionAlert}</span>
              </div>
            )}

            {/* Status Alert for Approval Pending / Rejected */}
            {statusAlert && (
              <div className={`auth-alert ${statusAlert.type}`}>
                <div>
                  <strong>{statusAlert.title}</strong>
                  <p style={{ margin: '4px 0 0 0' }}>{statusAlert.message}</p>
                </div>
              </div>
            )}

            {/* General Form Error / 429 */}
            {error && (
              <div className="auth-alert error">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <TextInput
                id="identifier"
                label="Email or Phone"
                type="text"
                placeholder="Enter your email or phone"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus={!location.state?.prefillEmail}
                autoComplete="username"
              />

              <PasswordInput
                id="password"
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus={Boolean(location.state?.prefillEmail)}
                autoComplete="current-password"
              />

              <div className="auth-row-options">
                <Checkbox
                  label="Remember me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />

                <Link to="/forgot-password" className="auth-link">
                  Forgot Password?
                </Link>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="large"
                loading={loading}
                disabled={loading}
                fullWidth
              >
                Login
              </Button>

              <div className="auth-form-footer">
                Don't have an account?{' '}
                <Link to="/register" className="auth-link">
                  Register
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
