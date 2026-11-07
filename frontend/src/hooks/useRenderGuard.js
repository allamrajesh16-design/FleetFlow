import { useRef } from 'react';

/**
 * Development-only render loop guard.
 * Logs a warning in the console when a component renders more than maxRenders times in 1 second.
 */
export default function useRenderGuard(componentName = 'Component', maxRenders = 50) {
  const renderTimesRef = useRef([]);

  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const now = Date.now();
  renderTimesRef.current.push(now);

  // Keep timestamps from the last 1 second (1000ms)
  renderTimesRef.current = renderTimesRef.current.filter((t) => now - t <= 1000);

  if (renderTimesRef.current.length > maxRenders) {
    console.warn(
      `[useRenderGuard WARNING] ${componentName} has rendered ${renderTimesRef.current.length} times in the last 1 second! This indicates a potential infinite re-render loop.`
    );
  }
}
