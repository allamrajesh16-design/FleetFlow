import React from 'react';
import useCountUp, { parseNumberString } from '../../hooks/useCountUp';

/**
 * Formats a raw numeric value according to standard formats:
 * - 'rupees': prefixed with ₹ and formatted in en-IN
 * - 'percent': suffixed with %
 * - 'decimal': formatted with 1 or 2 decimals
 * - 'number': standard localized number
 */
export function formatValue(rawNum, format, options = {}) {
  const num = typeof rawNum === 'number' ? rawNum : parseFloat(rawNum) || 0;
  switch (format) {
    case 'rupees':
      return `₹${num.toLocaleString('en-IN')}`;
    case 'percent':
      return `${num}%`;
    case 'decimal':
      return num.toFixed(options.decimals !== undefined ? options.decimals : 1);
    case 'number':
    default:
      return num.toLocaleString('en-IN');
  }
}

/**
 * CountUp Component
 * Contract:
 * - uses useCountUp hook
 * - renders ONLY plain text (the formatted value)
 * - sets aria-live="off" and aria-label with the final target value so screen readers get the final number directly
 * - handles null/undefined/0/huge numbers safely
 * - respects data-motion="off" or prefers-reduced-motion instantly
 */
export default function CountUp({
  value,
  format,
  duration = 800,
  startImmediately = true,
  className = '',
  style,
  decimals,
}) {
  // If format is explicitly provided, adapt target string
  let target = value;
  if (value === null || value === undefined) {
    target = 0;
  }

  if (format) {
    target = formatValue(target, format, { decimals });
  }

  const { value: animatedValue } = useCountUp(target, {
    duration,
    startImmediately,
    decimals,
  });

  // Calculate final target text for screen readers (aria-label)
  const finalMeta = parseNumberString(target);
  let finalFormatted = (finalMeta.hasComma || typeof target === 'number')
    ? Math.round(finalMeta.number).toLocaleString('en-IN')
    : finalMeta.decimals > 0
    ? finalMeta.number.toFixed(finalMeta.decimals)
    : Math.round(finalMeta.number).toString();
  const finalLabel = `${finalMeta.prefix}${finalFormatted}${finalMeta.suffix}`;

  return (
    <span
      className={className || undefined}
      style={style}
      aria-live="off"
      aria-label={finalLabel}
    >
      {animatedValue}
    </span>
  );
}

export { CountUp };
