/**
 * FleetFlow Time of Day and Progress Helpers
 */

/**
 * Returns time of day period:
 * - morning: 05:00 - 11:59 (5 to 12)
 * - afternoon: 12:00 - 16:59 (12 to 17)
 * - evening: 17:00 - 04:59 (17 to 5)
 */
export function getTimeOfDay(date = new Date()) {
  const hours = date.getHours();
  if (hours >= 5 && hours < 12) {
    return 'morning';
  }
  if (hours >= 12 && hours < 17) {
    return 'afternoon';
  }
  return 'evening';
}

/**
 * Returns metadata for the time of day:
 * icon, label, and high-contrast stop tokens.
 */
export function getTimeOfDayMeta(date = new Date()) {
  const period = getTimeOfDay(date);
  switch (period) {
    case 'morning':
      return {
        period: 'morning',
        icon: '☀️',
        label: 'Good morning',
        // Warm amber (token) to primary blue (token) - both stops >= 4.5:1 against white
        stopA: 'var(--warning-text)',
        stopB: 'var(--blue-700)',
      };
    case 'afternoon':
      return {
        period: 'afternoon',
        icon: '🌤️',
        label: 'Good afternoon',
        // Blue (token) to cyan-700 (token) - both stops >= 4.5:1 against white
        stopA: 'var(--blue-700)',
        stopB: 'var(--cyan-700)',
      };
    case 'evening':
    default:
      return {
        period: 'evening',
        icon: '🌙',
        label: 'Good evening',
        // Indigo (token) to navy-900 (token) - both stops >= 6.0:1 against white
        stopA: 'var(--indigo-600)',
        stopB: 'var(--navy-900)',
      };
  }
}

/**
 * Calculates a progressive color token between Red, Amber, and Green based on value (0-100%).
 * Uses tokens:
 * - < 40%: --danger (token)
 * - 40% - 79%: --amber-500 (token)
 * - >= 80%: --success (token)
 */
export function getProgressColor(percent) {
  const val = Number(percent) || 0;
  if (val < 40) {
    return { token: 'var(--danger)', hex: 'var(--danger)', status: 'low' };
  }
  if (val < 80) {
    return { token: 'var(--amber-500)', hex: 'var(--amber-500)', status: 'medium' };
  }
  return { token: 'var(--success)', hex: 'var(--success)', status: 'target_met' };
}
