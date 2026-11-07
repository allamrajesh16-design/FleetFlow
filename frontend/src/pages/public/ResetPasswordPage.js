import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/common/Button';
import AuthSidePanel, { AuthMobileHeader } from '../../components/auth/AuthSidePanel';
import images from '../../config/images';
import './AuthPages.css';

export default function ResetPasswordPage() {
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
          <div className="auth-form-header">
            <h1 className="auth-form-title">Password Reset Has Changed</h1>
            <p className="auth-form-subtitle">
              We have upgraded our security. Link-based password resets are no longer supported.
              Please use our new secure 6-digit email code process.
            </p>
          </div>

          <div className="auth-alert error" role="alert" style={{ margin: '20px 0' }}>
            <span>
              Reset links have been replaced with 6-digit email codes.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
            <Link to="/forgot-password">
              <Button variant="primary" size="large" fullWidth>
                Request a Reset Code
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="large" fullWidth>
                Back to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
