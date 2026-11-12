import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop Component
 * Listens to location changes in React Router and automatically resets
 * window and common scrollable container positions to (0, 0).
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Reset window scroll position
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    // Also reset common scrollable dashboard containers if present
    const containers = document.querySelectorAll(
      '#main-content, .dashboard-content, .dashboard-main, .app-layout-content, .driver-mobile-content'
    );
    containers.forEach((el) => {
      if (el && el.scrollTop > 0) {
        el.scrollTop = 0;
      }
    });
  }, [pathname]);

  return null;
}

