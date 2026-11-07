import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Logo from '../../components/common/Logo';
import Button from '../../components/common/Button';
import { TextInput, OtpDigitInput } from '../../components/forms';
import { verifyOtpApi, resendOtpApi } from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { MESSAGES } from '../../constants/messages';
import './VerifyOtpPage.css';
import './AuthPages.css';

function maskEmail(emailStr) {
  if (!emailStr || typeof emailStr !== 'string' || !emailStr.includes('@')) {
    return 'your email';
  }
  const [user, domain] = emailStr.split('@');
  if (!user || !domain) return emailStr;
  const firstChar = user.charAt(0);
  return `${firstChar}***@${domain}`;
}

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  // Email passed from register or login page
  const initialEmail = location.state?.email || '';
  const initialMessage = location.state?.message || '';
  const initialEmailMode = location.state?.email_mode || '';

  const [email, setEmail] = useState(initialEmail);
  const [emailMode, setEmailMode] = useState(initialEmailMode);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState(initialMessage);

  const [screenState, setScreenState] = useState('VERIFY'); // 'VERIFY' | 'CUSTOMER_COMPLETE' | 'WAITING_ADMIN' | 'WAITING_MANAGER'

  const inputRefs = useRef([]);

  // Auto-focus first digit on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  // 60-second countdown timer for Resend OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleDigitChange = (index, value) => {
    // Only allow single numeric digit
    const cleaned = value.replace(/[^0-9]/g, '');
    const newDigits = [...digits];

    if (!cleaned) {
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    // Take the last character typed
    newDigits[index] = cleaned[cleaned.length - 1];
    setDigits(newDigits);

    // Auto-advance to next input
    if (index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Move to previous box if current is empty
      inputRefs.current[index - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pasted)) {
      const split = pasted.split('');
      setDigits(split);
      if (inputRefs.current[5]) {
        inputRefs.current[5].focus();
      }
    }
  };

  const otpCode = digits.join('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please provide the registered email address.');
      return;
    }

    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    setLoading(true);

    try {
      const res = await verifyOtpApi({
        email: email.trim(),
        otp: otpCode,
      });

      const userRole = res?.role || location.state?.role || 'CUSTOMER';
      const userStatus = res?.approval_status;

      if (userRole === 'FLEET_MANAGER' || (userStatus === 'PENDING' && userRole === 'FLEET_MANAGER')) {
        setScreenState('WAITING_ADMIN');
        toast?.info(MESSAGES.VERIFY_STAFF_WAITING);
      } else if (userRole === 'DRIVER' || (userStatus === 'PENDING' && userRole === 'DRIVER')) {
        setScreenState('WAITING_MANAGER');
        toast?.info(MESSAGES.VERIFY_STAFF_WAITING);
      } else {
        setScreenState('CUSTOMER_COMPLETE');
        toast?.success(MESSAGES.VERIFY_CUSTOMER_DONE);
      }
    } catch (err) {
      const respData = err?.response?.data;
      let rawMsg = '';
      if (typeof respData === 'string') rawMsg = respData;
      else if (respData?.detail) rawMsg = respData.detail;
      else if (respData?.non_field_errors) rawMsg = respData.non_field_errors[0];
      else if (respData?.otp) rawMsg = respData.otp[0] || respData.otp;
      else rawMsg = getApiErrorMessage(err);

      let cleanMsg = rawMsg;
      const lower = String(rawMsg).toLowerCase();
      if (lower.includes('expired')) {
        cleanMsg = MESSAGES.OTP_EXPIRED;
      } else if (lower.includes('too many') || lower.includes('exceeded')) {
        cleanMsg = MESSAGES.OTP_TOO_MANY_ATTEMPTS;
      } else if (lower.includes('invalid') || lower.includes('wrong')) {
        cleanMsg = rawMsg.includes('attempts left') ? rawMsg : MESSAGES.OTP_WRONG('a few');
      }
      setError(cleanMsg);
      toast?.error(cleanMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) {
      toast?.warning(MESSAGES.OTP_RESEND_TOO_EARLY(countdown));
      return;
    }
    if (resending) return;
    setError('');

    if (!email.trim()) {
      setError('Please provide your email address to receive a new OTP.');
      return;
    }

    setResending(true);
    try {
      const res = await resendOtpApi({ email: email.trim() });
      if (res?.email_mode) {
        setEmailMode(res.email_mode);
      }
      setSuccessMsg(MESSAGES.OTP_RESEND_SUCCESS);
      toast?.success(MESSAGES.OTP_RESEND_SUCCESS);
      setCountdown(60);
      setDigits(['', '', '', '', '', '']);
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    } catch (err) {
      const errMsg = MESSAGES.EMAIL_DELIVERY_FAILED;
      setError(errMsg);
      toast?.error(errMsg);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-centered-container">
      <div className="auth-centered-brand">
        <Logo size="large" />
      </div>

      <div className="auth-centered-card fade-in">
        {screenState === 'CUSTOMER_COMPLETE' && (
          <div className="auth-form-card-inner">
            <div className="auth-form-header" style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--success-bg)',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 0 8px var(--success-bg)',
                }}
              >
                ✓
              </div>
              <h1 className="auth-form-title">Registration Complete</h1>
              <p className="auth-form-subtitle" style={{ marginTop: '8px', lineHeight: '1.5' }}>
                Your email has been verified successfully. Your account is active and you can now log in to start booking and tracking trips.
              </p>
            </div>
            <div style={{ marginTop: '24px' }}>
              <Button
                variant="primary"
                size="large"
                fullWidth
                onClick={() =>
                  navigate('/login', {
                    replace: true,
                    state: { message: 'Registration complete! You can login now.' },
                  })
                }
              >
                Proceed to Login
              </Button>
            </div>
          </div>
        )}

        {screenState === 'WAITING_ADMIN' && (
          <div className="auth-form-card-inner">
            <div className="auth-form-header" style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--warning-bg)',
                  color: 'var(--amber-500)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 0 8px var(--warning-bg)',
                }}
              >
                ⏳
              </div>
              <h1 className="auth-form-title">Waiting for Admin Approval</h1>
              <p className="auth-form-subtitle" style={{ marginTop: '8px', lineHeight: '1.5' }}>
                Your email has been verified successfully. Your Fleet Manager registration is currently pending review and approval by an Administrator. An email notification will be sent once your account is activated.
              </p>
            </div>
            <div style={{ marginTop: '24px' }}>
              <Button
                variant="secondary"
                size="large"
                fullWidth
                onClick={() => navigate('/login', { replace: true })}
              >
                Return to Login
              </Button>
            </div>
          </div>
        )}

        {screenState === 'WAITING_MANAGER' && (
          <div className="auth-form-card-inner">
            <div className="auth-form-header" style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--warning-bg)',
                  color: 'var(--amber-500)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 0 8px var(--warning-bg)',
                }}
              >
                ⏳
              </div>
              <h1 className="auth-form-title">Waiting for Fleet Manager Approval</h1>
              <p className="auth-form-subtitle" style={{ marginTop: '8px', lineHeight: '1.5' }}>
                Your email has been verified successfully. Your Driver registration is currently pending review and approval by a Fleet Manager. An email notification will be sent once your account is activated.
              </p>
            </div>
            <div style={{ marginTop: '24px' }}>
              <Button
                variant="secondary"
                size="large"
                fullWidth
                onClick={() => navigate('/login', { replace: true })}
              >
                Return to Login
              </Button>
            </div>
          </div>
        )}

        {screenState === 'VERIFY' && (
          <>
            <div className="auth-form-header">
              <h1 className="auth-form-title">Verify Your Email</h1>
              <p className="auth-form-subtitle">
                We sent a 6-digit code to{' '}
                <strong style={{ color: 'var(--color-text-primary)' }}>
                  {maskEmail(email)}
                </strong>
              </p>
              <p className="otp-spam-tip">Tip: Check your Spam folder if you don't see the code in your inbox.</p>
              {emailMode === 'console' && (
                <div className="otp-dev-note">
                  Dev mode: the OTP is printed in the server terminal.
                </div>
              )}
            </div>

            {/* Change / enter email toggle if not prefilled */}
            {!initialEmail && (
              <div style={{ marginBottom: '16px' }}>
                <TextInput
                  id="verify-email"
                  label="Account Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>
            )}

            {successMsg && (
              <div className="auth-alert success">
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              {/* Six Separate Digit Input Boxes */}
              <div className={`otp-digit-grid ${error ? 'has-error' : ''}`} onPaste={handlePaste}>
                {digits.map((digit, idx) => (
                  <OtpDigitInput
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    className={`otp-digit-box ${digit ? 'filled' : ''} ${screenState !== 'VERIFY' ? 'otp-box-success' : ''}`}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    aria-label={`Digit ${idx + 1}`}
                  />
                ))}
              </div>

              {/* Error messages shown under the boxes */}
              {error && (
                <div className="otp-error-message" role="alert">
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="large"
                loading={loading}
                disabled={loading || otpCode.length !== 6}
                fullWidth
              >
                Verify Account
              </Button>

              {/* Resend OTP button with animated countdown ring */}
              <div className="otp-resend-wrapper">
                {countdown > 0 ? (
                  <>
                    <div className="otp-countdown-ring-box" aria-hidden="true">
                      <svg className="otp-countdown-ring-svg" viewBox="0 0 32 32">
                        <circle
                          cx="16"
                          cy="16"
                          r="13"
                          fill="transparent"
                          strokeWidth="2.5"
                          className="otp-countdown-ring-bg"
                        />
                        <circle
                          cx="16"
                          cy="16"
                          r="13"
                          fill="transparent"
                          strokeWidth="2.5"
                          strokeDasharray="81.68"
                          strokeDashoffset={(81.68 * (1 - countdown / 60)).toFixed(2)}
                          strokeLinecap="round"
                          className="otp-countdown-ring-prog"
                        />
                      </svg>
                      <span className="otp-countdown-ring-sec">{countdown}</span>
                    </div>
                    <span className="otp-countdown-text">
                      Resend code in <strong>{countdown}s</strong>
                    </span>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={handleResend}
                    disabled={resending}
                    loading={resending}
                  >
                    Resend Verification Code
                  </Button>
                )}
              </div>

              <div className="auth-form-footer" style={{ marginTop: '16px' }}>
                Back to{' '}
                <Link to="/login" className="auth-link">
                  Sign In
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
