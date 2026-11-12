import React, { useState, useEffect, useRef, useCallback } from 'react';
import Button from './Button';
import IconButton from './IconButton';
import { CloseIcon } from './Icons';
import { useAuth } from '../../context/AuthContext';
import './LogoutDialog.css';

/**
 * LogoutDialog
 * Dedicated animated logout confirmation window used across all roles and viewports.
 * - Red-tinted circle with animated door & sliding arrow icon
 * - Expanding soft red ripple ring
 * - Progress bar that fills across the top when signing out
 * - Focus trap, focus returns to trigger, full ARIA alertdialog attributes
 * - 1.5s safety limit fallback so logout never stalls on animations
 */
export default function LogoutDialog({ isOpen, onClose }) {
  const { user, role, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const cardRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const triggerRef = useRef(null);

  // Fixed position body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;

    const origBodyOverflow = document.body.style.overflow;
    const origBodyPosition = document.body.style.position;
    const origBodyTop = document.body.style.top;
    const origBodyLeft = document.body.style.left;
    const origBodyWidth = document.body.style.width;
    const origBodyHeight = document.body.style.height;
    const origHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    return () => {
      document.documentElement.style.overflow = origHtmlOverflow;
      document.body.style.overflow = origBodyOverflow;
      document.body.style.position = origBodyPosition;
      document.body.style.top = origBodyTop;
      document.body.style.left = origBodyLeft;
      document.body.style.width = origBodyWidth;
      document.body.style.height = origBodyHeight;
      if (typeof window.scrollTo === 'function') {
        try {
          window.scrollTo(scrollX, scrollY);
        } catch (_) {}
      }
    };
  }, [isOpen]);

  // Store trigger element on open for focus return on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
      setIsClosing(false);
      setSigningOut(false);
      // Autofocus cancel button for safety
      const timer = setTimeout(() => {
        if (cancelBtnRef.current) {
          cancelBtnRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (signingOut) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  }, [signingOut, onClose]);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!signingOut) {
          handleClose();
        }
      } else if (e.key === 'Tab') {
        if (!cardRef.current) return;
        const focusable = cardRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, signingOut, handleClose]);

  if (!isOpen && !isClosing) return null;

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);

    let loggedOut = false;
    const executeLogout = async () => {
      if (loggedOut) return;
      loggedOut = true;
      try {
        await logout({ userInitiated: true });
      } catch (err) {
        // Safe fallback
      } finally {
        onClose();
      }
    };

    // 1.5 second maximum safety limit
    const safetyTimeout = setTimeout(executeLogout, 1500);

    // Standard 600ms progress fill & fade out
    setTimeout(async () => {
      clearTimeout(safetyTimeout);
      await executeLogout();
    }, 600);
  };

  const formatRole = (r) => {
    if (!r) return 'User';
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
  };

  const displayName = user?.full_name || user?.email || 'User';
  const roleName = formatRole(user?.role || role);

  return (
    <div
      className={`logout-dialog-overlay ${isClosing ? 'closing' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !signingOut) {
          handleClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={cardRef}
        className={`logout-dialog-card ${isClosing ? 'closing' : ''} ${
          signingOut ? 'signing-out' : ''
        }`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-desc"
      >
        {/* Progress bar during signout */}
        {signingOut && <div className="logout-progress-bar" aria-hidden="true" />}

        {/* Close X Button */}
        {!signingOut && (
          <IconButton
            icon={<CloseIcon size={16} />}
            aria-label="Close logout window"
            className="logout-dialog-close-btn"
            onClick={handleClose}
          />
        )}

        {/* Red Icon Circle with Door & Animated Arrow */}
        <div className="logout-icon-circle">
          <div className="logout-icon-ripple" aria-hidden="true" />
          <svg
            className="logout-icon-svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Door / Frame */}
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            {/* Arrow Group that animates */}
            <g className="logout-icon-arrow">
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </g>
          </svg>
        </div>

        {/* Title */}
        <h2 id="logout-dialog-title" className="logout-dialog-title logout-step-1">
          Sign out of FleetFlow?
        </h2>

        {/* Subtitle / User info */}
        <p id="logout-dialog-desc" className="logout-dialog-desc logout-step-2">
          Signed in as <strong>{displayName}</strong> ({roleName}).
          <br />
          You will need to sign in again.
        </p>

        {/* Action Buttons */}
        <div className="logout-dialog-actions logout-step-3">
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="outline"
            size="large"
            disabled={signingOut}
            onClick={handleClose}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="danger"
            size="large"
            loading={signingOut}
            disabled={signingOut}
            onClick={handleLogout}
          >
            {signingOut ? 'Signing out...' : 'Log Out'}
          </Button>
        </div>
      </div>
    </div>
  );
}

