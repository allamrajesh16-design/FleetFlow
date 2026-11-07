import React from 'react';
import { Link } from 'react-router-dom';

export default function Logo({ light = false, size = 'medium', to = '/', compact = false }) {
  const iconSizes = {
    small: 28,
    medium: 36,
    large: 48,
  };

  const textSizes = {
    small: '1.125rem',
    medium: '1.375rem',
    large: '1.75rem',
  };

  const currentSize = iconSizes[size] || iconSizes.medium;

  const content = (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 0 : '10px',
        userSelect: 'none',
      }}
    >
      {/* Bus in Rounded Square Icon */}
      <svg
        width={currentSize}
        height={currentSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="40" height="40" rx="10" fill="#2563EB" />
        {/* Bus Body */}
        <rect x="9" y="10" width="22" height="18" rx="4" fill="#FFFFFF" />
        {/* Windshield */}
        <rect x="12" y="13" width="16" height="7" rx="1.5" fill="#2563EB" />
        {/* Headlights */}
        <circle cx="13.5" cy="23.5" r="1.5" fill="#FBBF24" />
        <circle cx="26.5" cy="23.5" r="1.5" fill="#FBBF24" />
        {/* Grill line */}
        <line x1="17" y1="23.5" x2="23" y2="23.5" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
        {/* Wheels */}
        <rect x="11" y="28" width="4" height="2.5" rx="1" fill="#FFFFFF" />
        <rect x="25" y="28" width="4" height="2.5" rx="1" fill="#FFFFFF" />
      </svg>

      {/* FleetFlow Brand Text */}
      {!compact && (
        <span
          style={{
            fontFamily: 'var(--font-family-base)',
            fontSize: textSizes[size] || textSizes.medium,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: light ? '#FFFFFF' : 'var(--color-text-primary, #0F172A)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          Fleet
          <span style={{ color: '#2563EB' }}>Flow</span>
        </span>
      )}
    </div>
  );

  if (!to) {
    return content;
  }

  return (
    <Link to={to} style={{ textDecoration: 'none', display: 'inline-flex' }}>
      {content}
    </Link>
  );
}
