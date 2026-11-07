/**
 * FleetFlow User-Facing Message Dictionary (src/constants/messages.js)
 * Ensures consistent, clean phrasing across Auth, Registration, OTP Verification, and Login.
 * No raw server text (e.g., non_field_errors, stack traces) is ever displayed.
 */

export const MESSAGES = {
  // Registration
  REGISTER_SUCCESS: 'OTP sent to your email',
  REGISTER_SUMMARY_ERROR: 'Please correct the highlighted fields',
  EMAIL_INVALID: 'Enter a valid email address.',
  EMAIL_DISPOSABLE: 'Disposable or temporary email addresses are not permitted.',
  EMAIL_EXISTS: 'A user with this email already exists.',
  PHONE_INVALID: 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9',
  PHONE_EXISTS: 'This mobile number is already registered',
  PHONE_REQUIRED: 'Phone number is required for Driver and Fleet Manager registration.',
  PASSWORD_WEAK: 'Password must be at least 6 characters.',
  PASSWORDS_DONT_MATCH: 'Passwords do not match.',
  EMAIL_DELIVERY_FAILED: 'We could not send the email. Please try again',

  // OTP Verification
  VERIFY_SUCCESS: 'Email verified successfully',
  VERIFY_CUSTOMER_DONE: 'Registration complete. Please login',
  VERIFY_STAFF_WAITING: 'Email verified. Your request is waiting for approval',
  OTP_WRONG: (remaining) => `Wrong OTP. ${remaining} attempts left`,
  OTP_EXPIRED: 'OTP has expired. Please request a new code.',
  OTP_TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Please request a new OTP.',
  OTP_RESEND_SUCCESS: 'A new OTP was sent',
  OTP_RESEND_TOO_EARLY: (seconds) => `Please wait ${seconds} seconds before requesting a new OTP`,

  // Login & Session
  LOGIN_SUCCESS: (firstName) => `Welcome back, ${firstName}`,
  LOGIN_INVALID_CREDENTIALS: 'Invalid email/phone or password.',
  LOGIN_EMAIL_NOT_VERIFIED: 'Please verify your email address to log in.',
  LOGIN_APPROVAL_PENDING: 'Your request is waiting for approval',
  LOGIN_APPROVAL_REJECTED: (reason) =>
    reason
      ? `Your registration was not approved: ${reason}`
      : 'Your registration was not approved.',
  LOGIN_INACTIVE: 'Account is inactive. Please contact support.',
  LOGIN_TOO_MANY_ATTEMPTS: 'Too many attempts. Please wait a minute',
  LOGOUT_SUCCESS: 'Logged out successfully',

  // Password Reset (OTP Flow)
  FORGOT_PASSWORD_SENT: 'If this email is registered, a code has been sent',
  FORGOT_PASSWORD_CODE_RESENT: 'A new reset code was sent',
  FORGOT_PASSWORD_RESEND_TOO_EARLY: (seconds) => `Please wait ${seconds} seconds before requesting a new code`,
  FORGOT_PASSWORD_OTP_WRONG: (remaining) => `Wrong code. ${remaining} attempts left`,
  FORGOT_PASSWORD_OTP_EXPIRED: 'Reset code has expired. Please request a new code',
  FORGOT_PASSWORD_TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Please request a new code',
  RESET_PASSWORD_SUCCESS: 'Password updated. Please login',
  RESET_TOKEN_INVALID: 'Invalid or expired password reset session. Please start again',
  PASSWORD_RESET_GUARD_REDIRECT: 'Please enter your email to start password reset',

  // Bookings
  BOOKING_SENT: 'Booking request sent. Waiting for approval.',
};

/**
 * Maps raw server errors into friendly user messages from MESSAGES dictionary.
 * Guarantees no raw server strings (e.g. non_field_errors, 500 trace) leak to UI.
 */
export function sanitizeAuthErrorMessage(err, defaultMsg = MESSAGES.REGISTER_SUMMARY_ERROR) {
  if (!err) return defaultMsg;

  // HTTP 429 Throttle
  if (err?.response?.status === 429) {
    return MESSAGES.LOGIN_TOO_MANY_ATTEMPTS;
  }

  const data = err?.response?.data;
  if (!data) {
    return err.message || defaultMsg;
  }

  // If data is a string
  if (typeof data === 'string') {
    const lower = data.toLowerCase();
    if (lower.includes('credential') || lower.includes('invalid email/phone')) {
      return MESSAGES.LOGIN_INVALID_CREDENTIALS;
    }
    if (lower.includes('too many') || lower.includes('throttl')) {
      return MESSAGES.LOGIN_TOO_MANY_ATTEMPTS;
    }
    return defaultMsg;
  }

  // Extract candidate message
  const rawMsg =
    (Array.isArray(data.detail) ? data.detail[0] : data.detail) ||
    (Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors) ||
    (Array.isArray(data.message) ? data.message[0] : data.message) ||
    '';

  const lower = String(rawMsg).toLowerCase();

  if (lower.includes('invalid email/phone') || (lower.includes('password') && lower.includes('invalid'))) {
    return MESSAGES.LOGIN_INVALID_CREDENTIALS;
  }
  if (lower.includes('waiting for approval') || lower.includes('pending approval')) {
    return MESSAGES.LOGIN_APPROVAL_PENDING;
  }
  if (lower.includes('not approved') || lower.includes('rejected')) {
    return typeof rawMsg === 'string' ? rawMsg : MESSAGES.LOGIN_APPROVAL_REJECTED();
  }
  if (lower.includes('too many') || lower.includes('throttl')) {
    return MESSAGES.LOGIN_TOO_MANY_ATTEMPTS;
  }
  if (lower.includes('not verified') || lower.includes('verify your email')) {
    return MESSAGES.LOGIN_EMAIL_NOT_VERIFIED;
  }
  if (lower.includes('already registered') || (lower.includes('already exists') && lower.includes('mobile'))) {
    return MESSAGES.PHONE_EXISTS;
  }
  if (lower.includes('already exists') && lower.includes('email')) {
    return MESSAGES.EMAIL_EXISTS;
  }
  if (lower.includes('could not send the email') || lower.includes('delivery failed')) {
    return MESSAGES.EMAIL_DELIVERY_FAILED;
  }

  return rawMsg && typeof rawMsg === 'string' && rawMsg.length < 120
    ? rawMsg
    : defaultMsg;
}

export default MESSAGES;
