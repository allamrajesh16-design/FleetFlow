import React from 'react';
import './ButtonGroup.css';

/**
 * ButtonGroup Component
 * Connects multiple buttons into an integrated segmented button group
 */
export default function ButtonGroup({
  children,
  vertical = false,
  className = '',
  ...props
}) {
  const domProps = { ...props };
  delete domProps.vertical;

  return (
    <div
      className={`btn-group ${vertical ? 'btn-group-vertical' : ''} ${className}`}
      role="group"
      {...domProps}
    >
      {children}
    </div>
  );
}
