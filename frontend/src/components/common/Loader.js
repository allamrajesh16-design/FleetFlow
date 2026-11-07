import React from 'react';
import './Loader.css';

export function Spinner({ size = 'md', color = 'primary', className = '' }) {
  return (
    <div className={`spinner spinner-${size} spinner-${color} ${className}`} role="status">
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export function Skeleton({ width = '100%', height = '20px', borderRadius = '4px', className = '' }) {
  return (
    <div
      className={`skeleton-block ${className}`}
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  );
}

export function PageLoader({ text = 'Loading FleetFlow...' }) {
  return (
    <div className="page-loader-container">
      <Spinner size="lg" color="primary" />
      <p className="page-loader-text">{text}</p>
    </div>
  );
}

export default function Loader({ text = 'Loading...' }) {
  return <PageLoader text={text} />;
}

