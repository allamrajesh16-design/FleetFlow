import React, { useState } from 'react';
import { isMotionDisabled } from '../../hooks/useMotion';
import './Button.css';

/**
 * Shared Button Component
 * Variants: primary (blue gradient), secondary (outline), ghost, danger (red), success (green), danger-outline
 * Sizes: sm (small), md (medium), lg (large)
 * Motion enhancements:
 * - Ripple effect from click point
 * - Smooth transition from label to spinner
 * - Success checkmark state
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  success = false,
  disabled = false,
  icon = null,
  leftIcon = null,
  iconLeft = null,
  rightIcon = null,
  iconRight = null,
  fullWidth = false,
  className = '',
  onClick,
  as = 'button',
  href,
  ...props
}) {
  const [ripples, setRipples] = useState([]);

  // Normalize size names
  const normalizedSize = size === 'small' ? 'sm' : size === 'medium' ? 'md' : size === 'large' ? 'lg' : size;

  // Normalize variant names
  const normalizedVariant = variant === 'outline' ? 'secondary' : variant;

  const btnClasses = [
    'btn',
    `btn-${normalizedVariant}`,
    `btn-${normalizedSize}`,
    fullWidth ? 'btn-full-width' : '',
    loading ? 'btn-loading' : '',
    success ? 'btn-success-state' : '',
    className,
  ].filter(Boolean).join(' ');

  const resolvedLeftIcon = leftIcon || iconLeft || icon;
  const resolvedRightIcon = rightIcon || iconRight;

  const handleClick = (e) => {
    if (disabled || loading) return;

    if (!isMotionDisabled() && e && e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rippleId = Date.now() + Math.random();

      setRipples((prev) => [...prev, { id: rippleId, x, y }]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== rippleId));
      }, 500);
    }

    if (typeof onClick === 'function') {
      onClick(e);
    }
  };

  const content = (
    <>
      {success ? (
        <span className="btn-success-check" aria-hidden="true">✓</span>
      ) : loading ? (
        <span className="btn-spinner" aria-hidden="true" />
      ) : (
        resolvedLeftIcon && <span className="btn-icon-left">{resolvedLeftIcon}</span>
      )}

      {children && (
        <span className={`btn-text ${loading && !success ? 'btn-text-loading' : ''}`}>
          {children}
        </span>
      )}

      {!loading && !success && resolvedRightIcon && (
        <span className="btn-icon-right">{resolvedRightIcon}</span>
      )}

      {/* Ripple effects container */}
      <span className="btn-ripple-container" aria-hidden="true">
        {ripples.map((rip) => (
          <span
            key={rip.id}
            className="btn-ripple-circle"
            style={{ left: rip.x, top: rip.y }}
          />
        ))}
      </span>
    </>
  );

  // Clean all custom props before spreading onto DOM element
  const domProps = { ...props };
  delete domProps.leftIcon;
  delete domProps.rightIcon;
  delete domProps.iconLeft;
  delete domProps.iconRight;
  delete domProps.icon;
  delete domProps.loading;
  delete domProps.success;
  delete domProps.variant;
  delete domProps.size;
  delete domProps.fullWidth;
  delete domProps.as;

  if (as === 'a' || href) {
    return (
      <a
        href={href}
        className={btnClasses}
        onClick={disabled || loading ? (e) => e.preventDefault() : handleClick}
        aria-disabled={disabled || loading}
        {...domProps}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={handleClick}
      className={btnClasses}
      {...domProps}
    >
      {content}
    </button>
  );
}
