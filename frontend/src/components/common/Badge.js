import React, { useRef, useEffect, useState } from 'react';
import './Badge.css';

export default function Badge({
  status,
  variant, // 'green' | 'orange' | 'red' | 'blue' | 'grey'
  children,
  size = 'md', // 'sm' | 'md'
  dot = false,
  className = '',
}) {
  const getVariant = (st) => {
    if (!st) return 'grey';
    const s = String(st).toUpperCase().replace(/\s+/g, '_');
    // Green: ACTIVE, APPROVED, COMPLETED, PAID, CONFIRMED
    if (['ACTIVE', 'APPROVED', 'COMPLETED', 'PAID', 'CONFIRMED', 'SUCCESS'].includes(s)) return 'green';
    // Orange: PENDING, IN_PROGRESS, MAINTENANCE, PAYMENT_INITIATED, REFUND_PENDING, OVERDUE
    if (['PENDING', 'IN_PROGRESS', 'MAINTENANCE', 'PAYMENT_INITIATED', 'REFUND_PENDING', 'WARNING', 'OVERDUE'].includes(s)) return 'orange';
    // Red: REJECTED, CANCELLED, FAILED, EXPIRED, ERROR
    if (['REJECTED', 'CANCELLED', 'FAILED', 'EXPIRED', 'ERROR'].includes(s)) return 'red';
    // Blue: SCHEDULED, OPEN, INFO
    if (['SCHEDULED', 'OPEN', 'BUS_SEAT', 'VEHICLE', 'INFO'].includes(s)) return 'blue';
    // Purple: ON_TRIP
    if (['ON_TRIP'].includes(s)) return 'purple';
    // Grey: INACTIVE, UNPAID, DEFAULT
    return 'grey';
  };

  const finalVariant = variant || getVariant(status || children);
  const text = children || status;
  const s = String(status || children || '').toUpperCase().replace(/\s+/g, '_');
  const isLive = s === 'IN_PROGRESS' || s === 'LIVE' || String(text).toLowerCase().includes('live');

  // Track status transitions to fire pop animation and expanding ring
  const prevStatusRef = useRef(s);
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
    if (prevStatusRef.current && prevStatusRef.current !== s) {
      setHasChanged(true);
      const timer = setTimeout(() => setHasChanged(false), 500);
      prevStatusRef.current = s;
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = s;
  }, [s]);

  // Format status text: e.g. "IN_PROGRESS" -> "In Progress"
  const formattedText = typeof text === 'string'
    ? text
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : text;

  return (
    <span
      className={`badge badge-${finalVariant} badge-${size} ${
        hasChanged ? 'status-changed-animate' : ''
      } ${className}`}
    >
      {isLive ? (
        <span className="badge-live-dot" aria-hidden="true" />
      ) : (
        dot && <span className="badge-dot" aria-hidden="true" />
      )}
      {formattedText}
    </span>
  );
}
