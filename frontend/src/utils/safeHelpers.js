/**
 * Safe Helper Layer for FleetFlow
 * Provides robust object property access and API list response normalization.
 */

/**
 * Safely accesses deeply nested properties in objects.
 * @param {Object} obj - The target object
 * @param {string|Array<string>} path - Dot-separated path or array of keys (e.g., 'booking.customer.full_name')
 * @param {*} fallback - Default value if property is missing, null, undefined, or empty (default '-')
 * @returns {*} The value or fallback
 */
export function safeGet(obj, path, fallback = '-') {
  if (obj === null || obj === undefined) {
    return fallback;
  }

  try {
    const keys = Array.isArray(path) ? path : String(path).split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return fallback;
      }
      current = current[key];
    }

    if (current === null || current === undefined || current === '') {
      return fallback;
    }

    return current;
  } catch (err) {
    return fallback;
  }
}

/**
 * Normalizes any API response format into a standardized { items: Array, count: number } structure.
 * Handles arrays, DRF paginated responses, custom object wrappers, nulls, and error states.
 * @param {*} response - Raw API response or data payload
 * @returns {{ items: Array, count: number }}
 */
export function normalizeList(response) {
  if (!response) {
    return { items: [], count: 0 };
  }

  // Direct array
  if (Array.isArray(response)) {
    return {
      items: response,
      count: response.length,
    };
  }

  // Custom paginated object with count and data: [{...}]
  if (response && typeof response === 'object' && typeof response.count === 'number' && Array.isArray(response.data)) {
    return {
      items: response.data,
      count: response.count,
    };
  }

  // Axios response object wrapping data
  const data = response.data !== undefined ? response.data : response;

  if (Array.isArray(data)) {
    return {
      items: data,
      count: data.length,
    };
  }

  if (data && typeof data === 'object') {
    if (Array.isArray(data.results)) {
      return {
        items: data.results,
        count: typeof data.count === 'number' ? data.count : data.results.length,
      };
    }
    if (Array.isArray(data.rows)) {
      return {
        items: data.rows,
        count: typeof data.count === 'number' ? data.count : data.rows.length,
      };
    }
    if (Array.isArray(data.items)) {
      return {
        items: data.items,
        count: typeof data.count === 'number' ? data.count : data.items.length,
      };
    }
    if (Array.isArray(data.data)) {
      return {
        items: data.data,
        count: typeof data.count === 'number' ? data.count : data.data.length,
      };
    }
  }

  return { items: [], count: 0 };
}
