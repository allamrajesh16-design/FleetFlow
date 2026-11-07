import React, { useRef, useEffect, useState } from 'react';
import Card from './Card';
import CountUp from './CountUp';
import useCountUp from '../../hooks/useCountUp';
import './StatCard.css';

export default function StatCard({
  icon,
  iconBg = 'var(--blue-50)',
  iconColor = 'var(--primary)',
  label,
  title,
  value,
  subtext,
  description,
  trend, // { value: '+12%', isPositive: true }
  className = '',
  style,
}) {
  const displayLabel = label || title;
  const displaySubtext = subtext || description;
  const { numericValue } = useCountUp(value, { duration: 800 });

  // Brief flash up (green) or down (red) when value changes (max 2/sec)
  const prevValRef = useRef(value);
  const [flashClass, setFlashClass] = useState('');
  const lastFlashTimeRef = useRef(0);

  useEffect(() => {
    const numNow = typeof numericValue === 'number' && !isNaN(numericValue)
      ? numericValue
      : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    const numPrev = parseFloat(String(prevValRef.current).replace(/[^0-9.-]/g, ''));
    const now = Date.now();

    if (!isNaN(numNow) && !isNaN(numPrev) && numNow !== numPrev && now - lastFlashTimeRef.current >= 500) {
      lastFlashTimeRef.current = now;
      if (numNow > numPrev) {
        setFlashClass('number-flash-up');
      } else {
        setFlashClass('number-flash-down');
      }
      const t = setTimeout(() => setFlashClass(''), 1200);
      prevValRef.current = value;
      return () => clearTimeout(t);
    }
    prevValRef.current = value;
  }, [value, numericValue]);

  return (
    <Card className={`stat-card ${className}`} padding="normal" style={style}>
      <div className="stat-card-header">
        <div
          className="stat-card-icon-box motion-pop-in"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        {displayLabel && <span className="stat-card-label">{displayLabel}</span>}
      </div>

      <div className="stat-card-body">
        <h3 className={`stat-card-value ${flashClass}`}>
          <CountUp value={value} duration={800} />
        </h3>
      </div>

      {(displaySubtext || trend) && (
        <div className="stat-card-footer">
          {trend && (
            <span
              className={`stat-card-trend ${
                trend.isPositive ? 'trend-positive' : 'trend-negative'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </span>
          )}
          {displaySubtext && <span className="stat-card-subtext">{displaySubtext}</span>}
        </div>
      )}
    </Card>
  );
}
