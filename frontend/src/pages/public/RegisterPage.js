import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import { PhoneInput, isValidIndianPhone } from '../../components/forms';
import { MESSAGES, sanitizeAuthErrorMessage } from '../../constants/messages';
import { getRegisterOptionsApi, registerApi, checkEmailApi } from '../../api/auth';
import { useToast } from '../../context/ToastContext';
import AuthSidePanel, { AuthMobileHeader } from '../../components/auth/AuthSidePanel';
import images from '../../config/images';
import { useAuth, getHomePath } from '../../context/AuthContext';
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAuthenticated, logout } = useAuth();

  const handleSwitchUser = async () => {
    await logout({ silent: true, showToast: false });
  };

  const [roles, setRoles] = useState([
    { value: 'CUSTOMER', label: 'Customer' },
    { value: 'DRIVER', label: 'Driver' },
    { value: 'FLEET_MANAGER', label: 'Fleet Manager' },
  ]);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    role: 'CUSTOMER',
    license_number: '',
    license_expiry: '',
  });

  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [emailValid, setEmailValid] = useState(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    async function loadRoles() {
      try {
        const data = await getRegisterOptionsApi();
        if (isMounted && data && Array.isArray(data.roles)) {
          setRoles(data.roles);
          if (data.roles.length > 0) {
            setFormData((prev) => ({ ...prev, role: data.roles[0].value }));
          }
        }
      } catch (err) {
        // Fallback to default roles if request fails
      } finally {
        if (isMounted) setLoadingRoles(false);
      }
    }
    loadRoles();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'email') {
      setEmailValid(null);
      setEmailSuggestion(null);
    }
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const performCheckEmail = useCallback(async (emailToTest) => {
    if (!emailToTest) {
      setEmailValid(null);
      setCheckingEmail(false);
      setEmailSuggestion(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setCheckingEmail(true);

    try {
      const res = await checkEmailApi(emailToTest, { signal: controller.signal });
      if (res && res.valid) {
        setEmailValid(true);
        setFieldErrors((prev) => ({ ...prev, email: null }));
        setEmailSuggestion(null);
      } else {
        setEmailValid(false);
        const msg = res?.message || 'Invalid email address.';
        setFieldErrors((prev) => ({ ...prev, email: msg }));
        if (res?.code === 'DOMAIN_TYPO' && res?.suggestion) {
          setEmailSuggestion(res.suggestion);
        } else {
          setEmailSuggestion(null);
        }
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        return;
      }
      // DNS timeout or network issue does not block user as OTP is proof
      setEmailValid(null);
    } finally {
      setCheckingEmail(false);
    }
  }, []);

  // Real-time debounced email validation while typing (600ms delay)
  useEffect(() => {
    const emailToTest = formData.email.trim();
    if (!emailToTest) {
      setEmailValid(null);
      setCheckingEmail(false);
      setEmailSuggestion(null);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    const timer = setTimeout(() => {
      performCheckEmail(emailToTest);
    }, 600);

    return () => clearTimeout(timer);
  }, [formData.email, performCheckEmail]);

  const handleEmailBlur = () => {
    const emailToTest = formData.email.trim();
    if (!emailToTest) {
      setEmailValid(null);
      return;
    }
    performCheckEmail(emailToTest);
  };

  const handleUseSuggestion = (suggested) => {
    setFormData((prev) => ({ ...prev, email: suggested }));
    setEmailSuggestion(null);
    setFieldErrors((prev) => ({ ...prev, email: null }));
    performCheckEmail(suggested);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Client-side validations
    const errors = {};
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required.';
    if (!formData.email.trim()) errors.email = 'Email address is required.';
    if (!formData.password) errors.password = 'Password is required.';
    if (formData.password && formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }
    if (formData.password !== formData.confirm_password) {
      errors.confirm_password = 'Passwords do not match.';
    }

    // Phone requirement: required for Driver and Fleet Manager, optional for Customer
    const isPhoneRequired = formData.role === 'DRIVER' || formData.role === 'FLEET_MANAGER';
    if (isPhoneRequired && !formData.phone.trim()) {
      errors.phone = MESSAGES.PHONE_REQUIRED;
    } else if (formData.phone.trim() && !isValidIndianPhone(formData.phone)) {
      errors.phone = MESSAGES.PHONE_INVALID;
    }

    if (formData.role === 'DRIVER') {
      if (!formData.license_number.trim()) {
        errors.license_number = 'Driving license number is required.';
      }
      if (!formData.license_expiry) {
        errors.license_expiry = 'License expiry date is required.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast?.error(MESSAGES.REGISTER_SUMMARY_ERROR);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        password: formData.password,
        role: formData.role,
      };

      if (formData.role === 'DRIVER') {
        payload.license_number = formData.license_number.trim();
        payload.license_expiry = formData.license_expiry;
      }

      const res = await registerApi(payload);

      toast?.success(MESSAGES.REGISTER_SUCCESS);

      // Navigate to Verify OTP screen with email prefilled
      navigate('/verify-otp', {
        state: {
          email: formData.email.trim(),
          role: formData.role,
          email_mode: res?.email_mode,
          message: MESSAGES.REGISTER_SUCCESS,
        },
      });
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const newFieldErrors = {};
        for (const [key, val] of Object.entries(data)) {
          if (Array.isArray(val)) {
            newFieldErrors[key] = val[0];
          } else if (typeof val === 'string') {
            newFieldErrors[key] = val;
          }
        }
        if (data.detail && !data.email) {
          const detailLower = String(data.detail).toLowerCase();
          if (detailLower.includes('email') || detailLower.includes('deliver') || detailLower.includes('spelling')) {
            newFieldErrors.email = data.detail;
          }
        }
        setFieldErrors(newFieldErrors);
        toast?.error(data.detail || (newFieldErrors.email ? newFieldErrors.email : MESSAGES.REGISTER_SUMMARY_ERROR));
      } else {
        const msg = sanitizeAuthErrorMessage(err, MESSAGES.REGISTER_SUMMARY_ERROR);
        setError(msg);
        toast?.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const isDriver = formData.role === 'DRIVER';

  return (
    <div className="auth-split-container">
      {/* Left Side Hero Panel */}
      <AuthSidePanel
        imageConfig={images.registerSide}
        headline="Join the FleetFlow network"
        sentence="Create your account in a minute"
        points={[
          'Verified email and OTP',
          'Role based access',
          'Fast booking approvals',
        ]}
      />

      {/* Right Form Pane */}
      <div className="auth-split-form-pane">
        <AuthMobileHeader sentence="Create your account in a minute" />
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
              <h1 className="auth-form-title">Create an Account</h1>
              <p className="auth-form-subtitle">
                Register as a passenger, driver, or fleet operations manager
              </p>
            </div>

          {error && (
            <div className="auth-alert error">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <Input
              id="full_name"
              name="full_name"
              label="Full Name"
              type="text"
              placeholder="e.g. John Doe"
              value={formData.full_name}
              onChange={handleChange}
              error={fieldErrors.full_name}
              required
            />

            <Input
              id="email"
              name="email"
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleEmailBlur}
              error={fieldErrors.email}
              helperText={
                checkingEmail ? (
                  <span style={{ color: 'var(--color-text-muted, #64748b)' }}>Checking email...</span>
                ) : emailValid === true ? (
                  <span style={{ color: '#16a34a', fontWeight: 500 }}>
                    Looks fine. We will send a code to confirm it.
                  </span>
                ) : null
              }
              rightElement={
                checkingEmail ? (
                  <span
                    className="ff-email-spinner"
                    role="status"
                    aria-label="Checking email"
                    style={{
                      display: 'inline-block',
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(37,99,235,0.2)',
                      borderTopColor: '#2563eb',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }}
                  />
                ) : emailValid === true ? (
                  <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '16px' }} title="Looks fine">✓</span>
                ) : null
              }
              required
            />

            {emailSuggestion && (
              <div style={{ marginTop: '-4px', marginBottom: '12px' }}>
                <Button
                  type="button"
                  variant="outline"
                  size="small"
                  className="btn-use-suggestion"
                  onClick={() => handleUseSuggestion(emailSuggestion)}
                  style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                    fontWeight: 600,
                  }}
                >
                  Use {emailSuggestion}
                </Button>
              </div>
            )}

            <PhoneInput
              id="phone"
              name="phone"
              label="Phone Number"
              placeholder="98765 43210"
              value={formData.phone}
              onChange={handleChange}
              error={fieldErrors.phone}
              required={formData.role === 'DRIVER' || formData.role === 'FLEET_MANAGER'}
            />

            <Select
              id="role"
              name="role"
              label="Select Role"
              value={formData.role}
              onChange={handleChange}
              disabled={loadingRoles}
              error={fieldErrors.role}
              options={roles.map((r) => ({
                value: r.value,
                label: r.label,
              }))}
            />

            {/* Conditionally shown Driver fields */}
            {isDriver && (
              <div
                style={{
                  background: 'var(--color-bg-page)',
                  padding: '16px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-primary)' }}>
                  Driver License Details
                </div>
                <Input
                  id="license_number"
                  name="license_number"
                  label="Driver License Number"
                  type="text"
                  placeholder="e.g. DL-98234-A"
                  value={formData.license_number}
                  onChange={handleChange}
                  error={fieldErrors.license_number}
                  required={isDriver}
                />

                <Input
                  id="license_expiry"
                  name="license_expiry"
                  label="License Expiry Date"
                  type="date"
                  value={formData.license_expiry}
                  onChange={handleChange}
                  error={fieldErrors.license_expiry}
                  required={isDriver}
                />
              </div>
            )}

            <Input
              id="password"
              name="password"
              label="Password"
              type="password"
              placeholder="At least 6 characters"
              value={formData.password}
              onChange={handleChange}
              showPasswordToggle
              error={fieldErrors.password}
              required
            />

            {formData.password && (
              <div className="ff-strength-meter" aria-live="polite">
                {(() => {
                  const pwd = formData.password;
                  let score = 0;
                  if (pwd.length >= 6) score += 1;
                  if (pwd.length >= 8 && /[A-Z]/.test(pwd)) score += 1;
                  if (/\d/.test(pwd)) score += 1;
                  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

                  const widthMap = ['0%', '25%', '50%', '75%', '100%'];
                  const colorMap = ['var(--border)', 'var(--danger)', 'var(--amber-500)', 'var(--primary)', 'var(--success)'];
                  const labelMap = ['', 'Weak', 'Fair', 'Good', 'Strong'];

                  return (
                    <>
                      <div className="ff-strength-track">
                        <div
                          className="ff-strength-fill"
                          style={{
                            width: widthMap[score],
                            backgroundColor: colorMap[score],
                          }}
                        />
                      </div>
                      <div className="ff-strength-label" style={{ color: colorMap[score] }}>
                        <span>Password Strength</span>
                        <span>{labelMap[score]}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            <Input
              id="confirm_password"
              name="confirm_password"
              label="Confirm Password"
              type="password"
              placeholder="Repeat your password"
              value={formData.confirm_password}
              onChange={handleChange}
              showPasswordToggle
              error={fieldErrors.confirm_password}
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="large"
              loading={loading}
              disabled={loading || checkingEmail || emailValid === false || !formData.email.trim()}
              fullWidth
            >
              Register Account
            </Button>

            <div className="auth-form-footer">
              Already have an account?{' '}
              <Link to="/login" className="auth-link">
                Sign in
              </Link>
            </div>
          </form>
        </div>
        )}
      </div>
    </div>
  );
}
