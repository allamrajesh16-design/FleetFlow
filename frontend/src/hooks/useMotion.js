import { useState, useEffect } from 'react';

/**
 * useMotion
 * Global motion controller hook.
 * Checks for:
 * 1. prefers-reduced-motion media query
 * 2. process.env.REACT_APP_MOTION === 'off'
 * 3. [data-motion="off"] attribute on documentElement
 * Also pauses ambient animations when the tab is hidden.
 */
export function isMotionDisabled() {
  if (typeof window === 'undefined') return false;

  const envOff = process.env.REACT_APP_MOTION === 'off';
  const attrOff = document.documentElement.getAttribute('data-motion') === 'off';
  const reducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return Boolean(envOff || attrOff || reducedMotion);
}

export default function useMotion() {
  const [disabled, setDisabled] = useState(() => isMotionDisabled());

  useEffect(() => {
    // Sync data-motion attribute to DOM if process.env is set
    if (process.env.REACT_APP_MOTION === 'off') {
      document.documentElement.setAttribute('data-motion', 'off');
    }

    const mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const handleChange = () => {
      setDisabled(isMotionDisabled());
    };

    if (mql) {
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handleChange);
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(handleChange);
      }
    }

    // Pause ambient animations when document is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        document.body.classList.add('motion-paused');
      } else {
        document.body.classList.remove('motion-paused');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (mql) {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handleChange);
        } else if (typeof mql.removeListener === 'function') {
          mql.removeListener(handleChange);
        }
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { isMotionEnabled: !disabled, isReducedMotion: disabled };
}
