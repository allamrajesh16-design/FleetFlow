import { useState, useEffect } from 'react';

/**
 * Breakpoint thresholds matching docs/RESPONSIVE.md:
 * - Phone:   <= 767px
 * - Tablet:  768px - 1023px
 * - Laptop:  1024px - 1439px
 * - Desktop: >= 1440px
 */
export const BREAKPOINTS = {
  phoneMax: 767,
  tabletMin: 768,
  tabletMax: 1023,
  laptopMin: 1024,
  laptopMax: 1439,
  desktopMin: 1440,
};

function getBreakpointTier(width) {
  if (width <= BREAKPOINTS.phoneMax) return 'phone';
  if (width <= BREAKPOINTS.tabletMax) return 'tablet';
  if (width <= BREAKPOINTS.laptopMax) return 'laptop';
  return 'desktop';
}

export function useBreakpoint() {
  const [tier, setTier] = useState(() => {
    if (typeof window === 'undefined') return 'desktop';
    return getBreakpointTier(window.innerWidth);
  });

  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return 1366;
    return window.innerWidth;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId = null;

    const updateBreakpoint = () => {
      const currentWidth = window.innerWidth;
      setWidth(currentWidth);
      const newTier = getBreakpointTier(currentWidth);
      setTier((prev) => (prev !== newTier ? newTier : prev));
    };

    const handleResize = () => {
      if (timeoutId) cancelAnimationFrame(timeoutId);
      timeoutId = requestAnimationFrame(updateBreakpoint);
    };

    // Use matchMedia listeners for crisp zero-latency breakpoint edge transitions
    const mediaQueries = typeof window.matchMedia === 'function' ? [
      window.matchMedia(`(max-width: ${BREAKPOINTS.phoneMax}px)`),
      window.matchMedia(`(min-width: ${BREAKPOINTS.tabletMin}px) and (max-width: ${BREAKPOINTS.tabletMax}px)`),
      window.matchMedia(`(min-width: ${BREAKPOINTS.laptopMin}px) and (max-width: ${BREAKPOINTS.laptopMax}px)`),
      window.matchMedia(`(min-width: ${BREAKPOINTS.desktopMin}px)`),
    ] : [];

    mediaQueries.forEach((mq) => {
      if (mq.addEventListener) {
        mq.addEventListener('change', updateBreakpoint);
      } else if (mq.addListener) {
        mq.addListener(updateBreakpoint);
      }
    });

    window.addEventListener('resize', handleResize, { passive: true });
    updateBreakpoint();

    return () => {
      if (timeoutId) cancelAnimationFrame(timeoutId);
      window.removeEventListener('resize', handleResize);
      mediaQueries.forEach((mq) => {
        if (mq.removeEventListener) {
          mq.removeEventListener('change', updateBreakpoint);
        } else if (mq.removeListener) {
          mq.removeListener(updateBreakpoint);
        }
      });
    };
  }, []);

  return {
    tier,
    layout: tier,
    width,
    isPhone: tier === 'phone',
    isMobile: tier === 'phone',
    isTablet: tier === 'tablet',
    isLaptop: tier === 'laptop',
    isDesktop: tier === 'desktop',
    isTabletOrLarger: tier !== 'phone',
    isLaptopOrLarger: tier === 'laptop' || tier === 'desktop',
  };
}

export default useBreakpoint;

