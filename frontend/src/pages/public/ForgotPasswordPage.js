import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { PasswordInput, OtpDigitInput } from '../../components/forms';
import PasswordStrengthMeter, { checkPasswordCriteria } from '../../components/forms/PasswordStrengthMeter';
import AuthSidePanel, { AuthMobileHeader } from '../../components/auth/AuthSidePanel';
import images from '../../config/images';
import {
  forgotPasswordApi,
  verifyResetOtpApi,
  resetPasswordOtpApi,
} from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { useAuth, getHomePath } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { MESSAGES } from '../../constants/messages';
import './AuthPages.css';
import './VerifyOtpPage.css';
import './ForgotPasswordFlow.css';

/**
 * Utility to mask email for security:
 * e.g. "alexander@gmail.com" -> "a***@gmail.com"
 */
export function maskEmail(email = '') {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 1) {
    return `${local}***@${domain}`;
  }
  return `${local[0]}***@${domain}`;
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated, user } = useAuth();

  // Internal memory state (NEVER in URL, localStorage or sessionStorage)
  const [step, setStep] = useState(1); // 1: Email, 2: Code, 3: New Password
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');

  // Step 1: Email form state
  const [emailError, setEmailError] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);

  // Step 2: OTP verification state
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [loadingOtp, setLoadingOtp] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [validitySeconds, setValiditySeconds] = useState(600); // 10 minutes
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [isShake, setIsShake] = useState(false);
  const [isOtpSuccess, setIsOtpSuccess] = useState(false);
  const otpInputsRef = useRef([]);

  // Step 3: New password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Inform user if they refreshed in the middle of step 2 or step 3
  useEffect(() => {
    const prev = sessionStorage.getItem('ff_forgot_step');
    if (prev === '2' || prev === '3') {
      sessionStorage.removeItem('ff_forgot_step');
      toast?.info('Session expired. Please enter your email to continue.');
    }
  }, [toast]);

  // Keep track of active step for refresh detection
  useEffect(() => {
    if (step === 2 || step === 3) {
      sessionStorage.setItem('ff_forgot_step', String(step));
    } else {
      sessionStorage.removeItem('ff_forgot_step');
    }
  }, [step]);

  // 60-second Resend countdown interval
  useEffect(() => {
    if (step !== 2 || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, countdown]);

  // 10-minute Validity countdown interval
  useEffect(() => {
    if (step !== 2 || validitySeconds <= 0) return;
    const timer = setInterval(() => {
      setValiditySeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, validitySeconds]);

  // Handle Step 1: Send Code
  const handleSendCode = async (e) => {
    e.preventDefault();
    setEmailError('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setEmailError('Please enter your email address.');
      return;
    }

    setLoadingEmail(true);
    try {
      const res = await forgotPasswordApi({ email: cleanEmail });
      const waitSeconds = typeof res?.seconds_left === 'number' ? res.seconds_left : 60;
      setCountdown(waitSeconds);
      setValiditySeconds(600);
      setDigits(['', '', '', '', '', '']);
      setOtpError('');
      setAttemptsLeft(null);

      toast?.success(MESSAGES.FORGOT_PASSWORD_SENT);
      setStep(2);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setEmailError(msg);
      toast?.error(msg);
    } finally {
      setLoadingEmail(false);
    }
  };

  // Handle Resend Code in Step 2
  const handleResendCode = async () => {
    if (countdown > 0) {
      toast?.warning(MESSAGES.FORGOT_PASSWORD_RESEND_TOO_EARLY(countdown));
      return;
    }
    setOtpError('');
    try {
      const res = await forgotPasswordApi({ email: email.trim() });
      const waitSeconds = typeof res?.seconds_left === 'number' ? res.seconds_left : 60;
      setCountdown(waitSeconds);
      setValiditySeconds(600);
      setDigits(['', '', '', '', '', '']);
      setAttemptsLeft(null);
      toast?.success(MESSAGES.FORGOT_PASSWORD_CODE_RESENT);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setOtpError(msg);
      toast?.error(msg);
    }
  };

  // OTP Box change handler
  const handleDigitChange = (index, val) => {
    setOtpError('');
    const char = val.slice(-1);
    if (char && !/^\d$/.test(char)) return;

    const next = [...digits];
    next[index] = char;
    setDigits(next);

    if (char && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // OTP Box keydown handler (backspace)
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  // OTP Box paste support
  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (!/^\d+$/.test(pasted)) return;

    const charArray = pasted.slice(0, 6).split('');
    const next = ['', '', '', '', '', ''];
    charArray.forEach((c, idx) => {
      next[idx] = c;
    });
    setDigits(next);

    const nextFocus = Math.min(charArray.length, 5);
    otpInputsRef.current[nextFocus]?.focus();
  };

  // Handle Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setOtpError('');

    const otpCode = digits.join('');
    if (otpCode.length !== 6) {
      setOtpError('Please enter all 6 digits.');
      return;
    }

    setLoadingOtp(true);
    try {
      const res = await verifyResetOtpApi({
        email: email.trim(),
        otp: otpCode,
      });

      if (res?.reset_token) {
        setIsOtpSuccess(true);
        setResetToken(res.reset_token);
        setTimeout(() => {
          setStep(3);
        }, 400);
      }
    } catch (err) {
      setIsShake(true);
      setTimeout(() => setIsShake(false), 400);

      const data = err?.response?.data;
      const left = data?.attempts_left;
      if (typeof left === 'number') {
        setAttemptsLeft(left);
        if (left === 0) {
          const lockedMsg = MESSAGES.FORGOT_PASSWORD_TOO_MANY_ATTEMPTS;
          setOtpError(lockedMsg);
          toast?.error(lockedMsg);
          return;
        }
        const wrongMsg = MESSAGES.FORGOT_PASSWORD_OTP_WRONG(left);
        setOtpError(wrongMsg);
        toast?.error(wrongMsg);
        return;
      }

      const msg = getApiErrorMessage(err);
      if (msg.toLowerCase().includes('expired')) {
        setOtpError(MESSAGES.FORGOT_PASSWORD_OTP_EXPIRED);
        toast?.error(MESSAGES.FORGOT_PASSWORD_OTP_EXPIRED);
      } else {
        setOtpError(msg);
        toast?.error(msg);
      }
    } finally {
      setLoadingOtp(false);
    }
  };

  // Handle Step 3: Update Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (!resetToken) {
      setPasswordError(MESSAGES.RESET_TOKEN_INVALID);
      toast?.error(MESSAGES.RESET_TOKEN_INVALID);
      return;
    }

    const { isValid } = checkPasswordCriteria(newPassword);
    if (!isValid) {
      setPasswordError(MESSAGES.PASSWORD_WEAK);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(MESSAGES.PASSWORDS_DONT_MATCH);
      return;
    }

    setLoadingPassword(true);
    try {
      await resetPasswordOtpApi({
        reset_token: resetToken,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setResetSuccess(true);
      toast?.success(MESSAGES.RESET_PASSWORD_SUCCESS);
      setTimeout(() => {
        navigate('/login', { replace: true, state: { message: MESSAGES.RESET_PASSWORD_SUCCESS } });
      }, 1500);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setPasswordError(msg);
      toast?.error(msg);
    } finally {
      setLoadingPassword(false);
    }
  };

  // Format validity minutes/seconds
  const formatValidity = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // If user is already authenticated
  if (isAuthenticated && user) {
    return (
      <div className="auth-split-container">
        <AuthSidePanel
          imageConfig={images.loginSide}
          headline="Password Assistance"
          sentence="Secure account management with verified 2-factor OTP"
          points={['Encrypted reset session', 'Automatic device logout', 'Instant password change alerts']}
        />
        <div className="auth-split-form-pane">
          <AuthMobileHeader sentence="Secure account management" />
          <div className="auth-form-card fade-in">
            <div className="auth-form-header">
              <h1 className="auth-form-title">You are Signed In</h1>
              <p className="auth-form-subtitle">
                You are currently signed in as <strong>{user.full_name || user.email}</strong>.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '24px' }}>
              <Link to="/profile">
                <Button variant="primary" size="large" fullWidth>
                  Change Password in Profile
                </Button>
              </Link>
              <Button
                variant="outline"
                size="large"
                fullWidth
                onClick={() => navigate(getHomePath(user.role), { replace: true })}
              >
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-split-container">
      <AuthSidePanel
        imageConfig={images.loginSide}
        headline="Password Recovery"
        sentence="Secure account recovery with two-factor email OTP"
        points={[
          'Single-use 6-digit reset code',
          'Automatic logout across all devices',
          'Instant email confirmation notice',
        ]}
      />

      <div className="auth-split-form-pane">
        <AuthMobileHeader sentence="Secure account recovery" />

        <div className="auth-form-card fade-in">
          {/* 3-Step Animated Progress Bar */}
          <div className="forgot-progress-wrapper" aria-label="Password Reset Progress">
            <div className="forgot-progress-steps">
              <div className={`forgot-progress-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                <div className="forgot-step-circle">{step > 1 ? '✓' : '1'}</div>
                <span className="forgot-step-label">1 Email</span>
              </div>

              <div className={`forgot-step-divider ${step > 1 ? 'completed' : ''}`} />

              <div className={`forgot-progress-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                <div className="forgot-step-circle">{step > 2 ? '✓' : '2'}</div>
                <span className="forgot-step-label">2 Code</span>
              </div>

              <div className={`forgot-step-divider ${step > 2 ? 'completed' : ''}`} />

              <div className={`forgot-progress-step ${step === 3 ? 'active' : ''}`}>
                <div className="forgot-step-circle">3</div>
                <span className="forgot-step-label">3 New password</span>
              </div>
            </div>
          </div>

          {/* STEP 1: Email Form */}
          {step === 1 && (
            <div className="fade-in">
              <div className="auth-form-header">
                <h1 className="auth-form-title">Reset Your Password</h1>
                <p className="auth-form-subtitle">
                  Enter your registered FleetFlow account email to receive a secure 6-digit verification code.
                </p>
              </div>

              {emailError && (
                <div className="auth-alert error" role="alert">
                  <span>{emailError}</span>
                </div>
              )}

              <form onSubmit={handleSendCode} className="auth-form" noValidate>
                <Input
                  id="forgot-email"
                  label="Registered Email"
                  type="email"
                  placeholder="e.g. yourname@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  error={emailError}
                  required
                  autoFocus
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  loading={loadingEmail}
                  disabled={loadingEmail}
                  fullWidth
                >
                  Send code
                </Button>
              </form>

              <div className="auth-form-footer">
                Remember your password?{' '}
                <Link to="/login" className="auth-link">
                  Back to login
                </Link>
              </div>
            </div>
          )}

          {/* STEP 2: 6-Digit OTP Form */}
          {step === 2 && (
            <div className="fade-in">
              <Button
                type="button"
                variant="ghost"
                size="small"
                className="forgot-back-btn"
                onClick={() => {
                  setStep(1);
                }}
              >
                ← Back to email
              </Button>

              <div className="auth-form-header">
                <h1 className="auth-form-title">Enter Verification Code</h1>
                <p className="auth-form-subtitle">
                  We sent a 6-digit code to
                </p>
                <div>
                  <span className="forgot-email-badge">
                    {maskEmail(email)}
                    <Button
                      type="button"
                      variant="ghost"
                      size="small"
                      className="forgot-change-email-btn"
                      onClick={() => {
                        setStep(1);
                      }}
                    >
                      Wrong email?
                    </Button>
                  </span>
                </div>
                <p className="otp-spam-tip">Tip: Check your Spam folder if you don't see the code in your inbox.</p>
              </div>

              {otpError && (
                <div className="otp-error-message" role="alert">
                  <span>{otpError}</span>
                </div>
              )}

              {typeof attemptsLeft === 'number' && attemptsLeft > 0 && (
                <div className="forgot-attempts-note">
                  {attemptsLeft} attempt{attemptsLeft > 1 ? 's' : ''} remaining
                </div>
              )}

              <div
                className={`otp-digit-grid ${isShake ? 'has-error' : ''}`}
                onPaste={handlePaste}
              >
                {digits.map((digit, idx) => (
                  <OtpDigitInput
                    key={idx}
                    ref={(el) => (otpInputsRef.current[idx] = el)}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className={`otp-digit-box ${digit ? 'filled' : ''} ${isOtpSuccess ? 'otp-box-success' : ''}`}
                    aria-label={`Digit ${idx + 1}`}
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="primary"
                size="large"
                loading={loadingOtp}
                disabled={loadingOtp || digits.join('').length !== 6}
                onClick={handleVerifyOtp}
                fullWidth
              >
                Verify code
              </Button>

              {/* 60-second Resend countdown & Validity timer */}
              <div className="otp-resend-wrapper">
                {countdown > 0 ? (
                  <>
                    <div className="otp-countdown-ring-box" aria-hidden="true">
                      <svg className="otp-countdown-ring-svg" viewBox="0 0 32 32">
                        <circle
                          className="otp-countdown-ring-bg"
                          cx="16"
                          cy="16"
                          r="13"
                          fill="none"
                          strokeWidth="2.5"
                        />
                        <circle
                          className="otp-countdown-ring-prog"
                          cx="16"
                          cy="16"
                          r="13"
                          fill="none"
                          strokeWidth="2.5"
                          strokeDasharray="81.68"
                          strokeDashoffset={81.68 - (81.68 * (60 - countdown)) / 60}
                        />
                      </svg>
                      <span className="otp-countdown-ring-sec">{countdown}</span>
                    </div>
                    <span className="otp-countdown-text">Resend code in {countdown}s</span>
                  </>
                ) : (
                  <Button variant="ghost" size="small" onClick={handleResendCode}>
                    Resend code
                  </Button>
                )}
              </div>

              <div className="forgot-validity-timer">
                Code expires in: <strong>{formatValidity(validitySeconds)}</strong>
              </div>

              <div className="auth-form-footer">
                <Link to="/login" className="auth-link">
                  Back to login
                </Link>
              </div>
            </div>
          )}

          {/* STEP 3: New Password Form */}
          {step === 3 && (
            <div className="fade-in">
              <Button
                type="button"
                variant="ghost"
                size="small"
                className="forgot-back-btn"
                onClick={() => {
                  setStep(2);
                }}
              >
                ← Back to code
              </Button>

              <div className="auth-form-header">
                <h1 className="auth-form-title">Create New Password</h1>
                <p className="auth-form-subtitle">
                  Choose a strong, unique password for your FleetFlow account.
                </p>
              </div>

              {resetSuccess && (
                <div className="forgot-success-icon-wrap" aria-hidden="true">
                  ✓
                </div>
              )}

              {passwordError && (
                <div className="auth-alert error" role="alert">
                  <span>{passwordError}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="auth-form" noValidate>
                <PasswordInput
                  id="forgot-new-password"
                  label="New Password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  error={passwordError}
                  required
                  autoFocus
                />

                {/* Live Password Strength Meter & Rule Checklist */}
                <PasswordStrengthMeter password={newPassword} />

                <PasswordInput
                  id="forgot-confirm-password"
                  label="Confirm New Password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  required
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  loading={loadingPassword}
                  disabled={loadingPassword || !newPassword || !confirmPassword || resetSuccess}
                  fullWidth
                >
                  {resetSuccess ? 'Password Updated!' : 'Update password'}
                </Button>
              </form>

              <div className="auth-form-footer">
                <Link to="/login" className="auth-link">
                  Back to login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
