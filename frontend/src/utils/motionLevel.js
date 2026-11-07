/**
 * FleetFlow Motion Level System
 * Returns: "full" | "lite" | "off"
 *
 * Rules:
 * - "off": prefers-reduced-motion: reduce OR REACT_APP_MOTION === 'off'
 * - "lite": mobile / small screen (<768px), navigator.hardwareConcurrency <= 4,
 *           navigator.deviceMemory <= 4, OR navigator.connection.saveData === true
 * - "full": default on desktop devices with sufficient performance resources
 */

export function getMotionLevel() {
  if (typeof window === 'undefined') return 'full';

  // 1. Check explicit environment override
  if (process.env.REACT_APP_MOTION === 'off') {
    return 'off';
  }

  // 2. Check prefers-reduced-motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'off';
  }

  // 3. Check hardware & network constraints
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const isMobile = window.innerWidth <= 768;
  const lowCpu = nav && typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
  const lowRam = nav && typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const saveData = nav && nav.connection && nav.connection.saveData === true;

  if (isMobile || lowCpu || lowRam || saveData) {
    return 'lite';
  }

  return 'full';
}

export function applyMotionLevel(level) {
  if (typeof document === 'undefined') return;
  const finalLevel = level || getMotionLevel();
  document.documentElement.setAttribute('data-motion', finalLevel);
  return finalLevel;
}

