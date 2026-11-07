import React from 'react';
import { useLocation } from 'react-router-dom';
import { isMotionDisabled } from '../../hooks/useMotion';

/**
 * PageTransition
 * Wraps route content with a lightweight 200ms fade and 8px rise on route change.
 * Zero layout shift, no external animation libraries.
 */
export default function PageTransition({ children }) {
  const location = useLocation();
  const disabled = isMotionDisabled();

  if (disabled) {
    return <div className="page-transition-wrap-static">{children}</div>;
  }

  return (
    <div key={location.pathname} className="page-transition-wrap">
      {children}
    </div>
  );
}
