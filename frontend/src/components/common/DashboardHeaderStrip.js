import React, { useState, useEffect } from 'react';
import { getTimeOfDayMeta } from '../../utils/motionTimeAndColor';

/**
 * DashboardHeaderStrip
 * Features:
 * - Dynamic role-based gradient strip (Admin, Manager, Driver, Customer)
 * - Slow diagonal light sweep (3 times then idle)
 * - Time-of-day greeting (Morning amber-to-blue, Afternoon blue-to-cyan, Evening indigo-to-navy)
 * - Auto-rechecks time of day every 10 minutes with smooth 1.5s color cross-fade
 */
export default function DashboardHeaderStrip({ role = 'admin', title, defaultSubtitle }) {
  const [tod, setTod] = useState(() => getTimeOfDayMeta());

  useEffect(() => {
    // Re-check time of day every 10 minutes (600,000 ms)
    const interval = setInterval(() => {
      setTod(getTimeOfDayMeta());
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const roleClass = `${role}-strip`;

  return (
    <div
      className={`dashboard-header-strip ${roleClass}`}
      style={{
        '--tod-stop-a': tod.stopA,
        '--tod-stop-b': tod.stopB,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h1>{title}</h1>
        {defaultSubtitle && (
          <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.85)', marginTop: '2px' }}>
            {defaultSubtitle}
          </span>
        )}
      </div>

      <div className="tod-greeting-badge" title={tod.label}>
        <span aria-hidden="true">{tod.icon}</span>
        <span>{tod.label}</span>
      </div>
    </div>
  );
}

