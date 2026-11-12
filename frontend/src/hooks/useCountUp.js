import { useState, useEffect } from 'react';
import { isMotionDisabled } from './useMotion';

/**
 * Parses numeric value, prefix (e.g. ₹, $), and suffix (e.g. %, Cr, k+, /mo).
 */
export function parseNumberString(val) {
  if (typeof val === 'number') {
    return { prefix: '', number: val, suffix: '', decimals: Number.isInteger(val) ? 0 : 1 };
  }

  const str = String(val ?? '').trim();
  if (!str) {
    return { prefix: '', number: 0, suffix: '', decimals: 0 };
  }

  // Regex to match prefix, number (with commas/dots), and suffix
  const match = str.match(/^([^\d\-+.]*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) {
    return { prefix: '', number: null, suffix: str, decimals: 0, isNonNumeric: true };
  }

  const prefix = match[1] || '';
  const numRaw = match[2].replace(/,/g, '');
  const suffix = match[3] || '';
  const parsedNum = parseFloat(numRaw) || 0;
  const decimals = match[2].includes('.') ? match[2].split('.')[1].length : 0;

  return { prefix, number: parsedNum, suffix, decimals, hasComma: match[2].includes(',') };
}

/**
 * useCountUp
 * Smoothly animates a number from 0 to the target value over durationMs (default 800ms).
 * Respects reduced motion and process.env.REACT_APP_MOTION=off (shows target instantly).
 *
 * Contract:
 * Returns an object with:
 * {
 *   value: string (formatted display string with prefix/suffix),
 *   numericValue: number (current instantaneous numeric value),
 *   isAnimating: boolean (true while frame animation is running)
 * }
 */
export default function useCountUp(targetValue, { duration = 800, startImmediately = true, decimals: explicitDecimals } = {}) {
  const { prefix, number, suffix, decimals: parsedDecimals, hasComma, isNonNumeric } = parseNumberString(targetValue);
  const decimals = explicitDecimals !== undefined ? explicitDecimals : parsedDecimals;
  const [currentVal, setCurrentVal] = useState(() => (isMotionDisabled() || isNonNumeric || number === null ? (number ?? 0) : 0));
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isNonNumeric || number === null || isMotionDisabled() || !startImmediately || number === 0) {
      setCurrentVal(number ?? 0);
      return;
    }

    let startTime = null;
    let animationFrameId = null;
    setIsAnimating(true);

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // ease-out cubic progress
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextNum = eased * number;

      setCurrentVal(nextNum);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setCurrentVal(number);
        setIsAnimating(false);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [number, duration, startImmediately, isNonNumeric]);

  // Format the display string
  const formattedNumber = (() => {
    if (isNonNumeric || number === null) {
      return '';
    }
    if (decimals > 0) {
      return currentVal.toFixed(decimals);
    }
    const rounded = Math.round(currentVal);
    if (hasComma) {
      // Indian numbering format if contains commas originally
      return rounded.toLocaleString('en-IN');
    }
    return rounded.toString();
  })();

  const display = (isNonNumeric || number === null)
    ? String(targetValue ?? '')
    : `${prefix}${formattedNumber}${suffix}`;

  return {
    value: display,
    numericValue: currentVal,
    isAnimating,
  };
}

export { useCountUp };

