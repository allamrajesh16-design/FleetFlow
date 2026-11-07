import { useState, useEffect, useRef } from 'react';
import { isMotionDisabled } from './useMotion';

/**
 * useReveal
 * IntersectionObserver helper that reveals an element once when it enters the viewport.
 * Supports a stagger index (staggerIndex * 40ms delay).
 * If motion is disabled, reveals instantly without transition delay.
 */
export default function useReveal({
  staggerIndex = 0,
  threshold = 0.15,
  rootMargin = '0px 0px -40px 0px',
  once = true,
} = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(() => isMotionDisabled());

  useEffect(() => {
    if (isMotionDisabled()) {
      setIsVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    if (typeof window.IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (once) {
              observer.unobserve(entry.target);
            }
          } else if (!once) {
            setIsVisible(false);
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, once]);

  const delayMs = Math.min(staggerIndex, 12) * 40;
  const style = isMotionDisabled()
    ? {}
    : {
        transitionDelay: `${delayMs}ms`,
        animationDelay: `${delayMs}ms`,
      };

  return { ref, isVisible, style };
}

export { useReveal };

