/**
 * Centralized Storage Helper for FleetFlow Authentication
 * Rules:
 * - Remember me UNCHECKED (default): tokens & user in sessionStorage only. Closing tab/browser ends session.
 * - Remember me CHECKED: tokens & user in localStorage for at most 7 days.
 * - Never keep tokens in both places. When one mode is chosen, remove the other.
 * - On app start, if remember is false and no sessionStorage tokens exist, user is logged out.
 * - On app start, clean old tokens left in localStorage unless remember is true.
 */

export const KEY_ACCESS = 'fleetflow_access_token';
export const KEY_REFRESH = 'fleetflow_refresh_token';
export const KEY_USER = 'fleetflow_user';
export const KEY_REMEMBER = 'fleetflow_remember';
export const KEY_LAST_ACTIVE = 'fleetflow_last_active';

export const MAX_REMEMBER_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Initialize storage rules on app startup.
 * Clears orphaned localStorage tokens if remember was false.
 * Checks 7-day expiration if remember was true.
 */
export function initAuthStorage() {
  try {
    const isRemembered = localStorage.getItem(KEY_REMEMBER) === 'true';

    if (!isRemembered) {
      // Remove any leftover tokens from localStorage
      localStorage.removeItem(KEY_ACCESS);
      localStorage.removeItem(KEY_REFRESH);
      localStorage.removeItem(KEY_USER);
      localStorage.removeItem(KEY_LAST_ACTIVE);
      localStorage.removeItem('fleetflow_remember_me');
      return;
    }

    const lastActiveStr = localStorage.getItem(KEY_LAST_ACTIVE);
    const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : 0;
    const now = Date.now();

    if (!lastActive || now - lastActive > MAX_REMEMBER_AGE_MS) {
      // 7-day session expired
      localStorage.removeItem(KEY_ACCESS);
      localStorage.removeItem(KEY_REFRESH);
      localStorage.removeItem(KEY_USER);
      localStorage.removeItem(KEY_REMEMBER);
      localStorage.removeItem(KEY_LAST_ACTIVE);
      localStorage.removeItem('fleetflow_remember_me');
    } else {
      // Valid remembered session: refresh activity timestamp
      localStorage.setItem(KEY_LAST_ACTIVE, now.toString());
    }
  } catch (e) {}
}

/**
 * Read token from valid storage.
 * Prioritizes sessionStorage.
 * Only falls back to localStorage if remember is true and not expired.
 */
export function getStoredToken(key) {
  try {
    const sessVal = sessionStorage.getItem(key);
    if (sessVal) return sessVal;

    const isRemembered = localStorage.getItem(KEY_REMEMBER) === 'true';
    if (isRemembered) {
      const lastActiveStr = localStorage.getItem(KEY_LAST_ACTIVE);
      const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : 0;
      if (lastActive && Date.now() - lastActive <= MAX_REMEMBER_AGE_MS) {
        return localStorage.getItem(key);
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Read stored user object.
 */
export function getStoredUser() {
  try {
    const userStr = getStoredToken(KEY_USER);
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Save authentication tokens & user.
 * Exactly one storage target is used; the other is completely cleared.
 */
export function saveStoredAuth({ access, refresh, user, remember = false }) {
  try {
    if (remember) {
      // Clear sessionStorage
      sessionStorage.removeItem(KEY_ACCESS);
      sessionStorage.removeItem(KEY_REFRESH);
      sessionStorage.removeItem(KEY_USER);

      // Save to localStorage
      if (access) localStorage.setItem(KEY_ACCESS, access);
      if (refresh) localStorage.setItem(KEY_REFRESH, refresh);
      if (user) {
        localStorage.setItem(
          KEY_USER,
          typeof user === 'string' ? user : JSON.stringify(user)
        );
      }
      localStorage.setItem(KEY_REMEMBER, 'true');
      localStorage.setItem(KEY_LAST_ACTIVE, Date.now().toString());
    } else {
      // Clear localStorage tokens and remember flags
      localStorage.removeItem(KEY_ACCESS);
      localStorage.removeItem(KEY_REFRESH);
      localStorage.removeItem(KEY_USER);
      localStorage.removeItem(KEY_LAST_ACTIVE);
      localStorage.setItem(KEY_REMEMBER, 'false');

      // Save to sessionStorage
      if (access) sessionStorage.setItem(KEY_ACCESS, access);
      if (refresh) sessionStorage.setItem(KEY_REFRESH, refresh);
      if (user) {
        sessionStorage.setItem(
          KEY_USER,
          typeof user === 'string' ? user : JSON.stringify(user)
        );
      }
    }
  } catch (e) {}
}

/**
 * Update stored user in active storage.
 */
export function updateStoredUser(user) {
  try {
    const isRemembered = localStorage.getItem(KEY_REMEMBER) === 'true';
    const target = isRemembered ? localStorage : sessionStorage;
    target.setItem(
      KEY_USER,
      typeof user === 'string' ? user : JSON.stringify(user)
    );
  } catch (e) {}
}

/**
 * Update last active timestamp if remembered in localStorage.
 */
export function touchLastActive() {
  try {
    if (localStorage.getItem(KEY_REMEMBER) === 'true') {
      localStorage.setItem(KEY_LAST_ACTIVE, Date.now().toString());
    }
  } catch (e) {}
}

/**
 * Remove all FleetFlow keys from both localStorage and sessionStorage.
 */
export function clearFleetFlowStorage() {
  const knownKeys = [
    KEY_ACCESS,
    KEY_REFRESH,
    KEY_USER,
    KEY_REMEMBER,
    KEY_LAST_ACTIVE,
    'fleetflow_remember_me',
    'fleetflow_remember_identifier',
    'fleetflow_logout_event',
    'fleetflow_view_trips',
    'fleetflow_view_users',
    'fleetflow_view_vehicles',
    'fleetflow_view_payments',
    'fleetflow_view_payments_history',
    'fleetflow_view_drivers',
    'fleetflow_view_my_bookings',
    'fleetflow_view_bookings',
  ];

  const clearFrom = (storage) => {
    try {
      knownKeys.forEach((k) => storage.removeItem(k));
      const toRemove = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.toLowerCase().startsWith('fleetflow')) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => storage.removeItem(k));
    } catch (e) {}
  };

  clearFrom(localStorage);
  clearFrom(sessionStorage);
}

/**
 * Check if a valid session exists in storage.
 */
export function hasStoredSession() {
  return !!getStoredToken(KEY_ACCESS);
}
