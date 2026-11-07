import React, { useRef, useEffect, useState } from 'react';
import './ExpiryBadge.css';

/**
 * ExpiryBadge Component:
 * - VALID: Green badge ("X days left")
 * - EXPIRING_SOON: Orange badge ("X days left" <= 30 days)
 * - EXPIRED: Red badge ("Expired X days ago" or "Expired today")
 * Transitions: Pop and expand ring when days_left crosses 30 and 7.
 */
export default function ExpiryBadge({
  expiryDate,
  daysLeft: propDaysLeft,
  expiryStatus: propStatus,
  size = 'md', // 'sm' | 'md'
  showDays = true,
  className = '',
}) {
  let daysLeft = propDaysLeft;

  if (daysLeft === undefined || daysLeft === null) {
    if (expiryDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(expiryDate);
      target.setHours(0, 0, 0, 0);
      daysLeft = Math.round((target - today) / (1000 * 60 * 60 * 24));
    } else {
      daysLeft = 0;
    }
  }

  let status = propStatus;
  if (!status) {
    if (daysLeft < 0) {
      status = 'EXPIRED';
    } else if (daysLeft <= 30) {
      status = 'EXPIRING_SOON';
    } else {
      status = 'VALID';
    }
  }

  // Detect crossing of 30 or 7 days thresholds
  const prevDaysRef = useRef(daysLeft);
  const [crossedThreshold, setCrossedThreshold] = useState(false);

  useEffect(() => {
    const prev = prevDaysRef.current;
    if (
      (prev > 30 && daysLeft <= 30) ||
      (prev > 7 && daysLeft <= 7) ||
      (prev >= 0 && daysLeft < 0)
    ) {
      setCrossedThreshold(true);
      const t = setTimeout(() => setCrossedThreshold(false), 500);
      prevDaysRef.current = daysLeft;
      return () => clearTimeout(t);
    }
    prevDaysRef.current = daysLeft;
  }, [daysLeft]);

  let variant = 'green';
  let label = 'Valid';

  if (status === 'EXPIRED' || daysLeft < 0) {
    variant = 'red';
    const absDays = Math.abs(daysLeft);
    label = absDays === 0 ? 'Expired today' : `Expired ${absDays} day${absDays === 1 ? '' : 's'} ago`;
  } else if (status === 'EXPIRING_SOON' || daysLeft <= 30) {
    variant = 'orange';
    label = showDays ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Expiring Soon';
  } else {
    variant = 'green';
    label = showDays ? `Valid (${daysLeft}d left)` : 'Valid';
  }

  return (
    <span
      className={`expiry-badge expiry-badge-${variant} expiry-badge-${size} ${
        crossedThreshold ? 'status-changed-animate' : ''
      } ${className}`}
    >
      <span className="expiry-badge-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
