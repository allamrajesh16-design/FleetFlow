import React from 'react';
import { Skeleton } from './Loader';

export { Skeleton };

export function SkeletonCard({ height = '180px', borderRadius = '14px', className = '' }) {
  return (
    <div
      className={`skeleton-card-container ${className}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius,
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <Skeleton width="40%" height="24px" borderRadius="6px" />
      <Skeleton width="90%" height="16px" borderRadius="4px" />
      <Skeleton width="70%" height="16px" borderRadius="4px" />
      <Skeleton width="100%" height={height} borderRadius="8px" />
    </div>
  );
}

export default Skeleton;
