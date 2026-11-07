import React, { useRef, useEffect } from 'react';
import { getProgressColor } from '../../utils/motionTimeAndColor';

/**
 * LivingProgressBar
 * Progress bar with:
 * - Smooth fill growth
 * - Red -> Amber -> Green interpolation based on percentage value
 * - Diagonal moving stripes when isLive or isLoading
 * - Green target celebration pop when target met (>= 80% or 100%)
 */
export default function LivingProgressBar({
  value = 0,
  max = 100,
  isLive = false,
  isLoading = false,
  showLabel = false,
  label = '',
  className = '',
  style
}) {
  const percent = Math.min(100, Math.max(0, Math.round((Number(value) / Number(max)) * 100)));
  const { token, status } = getProgressColor(percent);

  const prevStatusRef = useRef(status);
  const isTargetMet = percent >= 80;

  useEffect(() => {
    prevStatusRef.current = status;
  }, [status]);

  return (
    <div className={`living-progress-container ${className}`} style={style}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem' }}>
          <span style={{ fontWeight: 500, color: 'var(--text)' }}>{label}</span>
          <span
            style={{
              fontWeight: 600,
              color: token,
              transition: 'color 300ms ease'
            }}
            className={isTargetMet ? 'progress-target-met' : ''}
          >
            {percent}%
          </span>
        </div>
      )}

      <div className="living-progress-bar">
        <div
          className={`living-progress-fill ${isLive || isLoading ? 'progress-stripes-live' : ''} ${
            isTargetMet ? 'progress-target-met' : ''
          }`}
          style={{
            width: `${percent}%`,
            backgroundColor: token
          }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin="0"
          aria-valuemax="100"
        />
      </div>
    </div>
  );
}

