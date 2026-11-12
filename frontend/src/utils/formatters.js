/**
 * FleetFlow Currency and Date Formatters
 */

/**
 * Format money to 'Rs. 1,250' or '₹1,250'
 */
export function formatMoney(amount, symbol = 'Rs. ') {
  if (amount === null || amount === undefined || amount === '' || Number(amount) === 0) {
    return 'Rs.';
  }
  const num = Number(amount);
  if (isNaN(num)) return 'Rs.';
  return `Rs. ${num.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
  })}`;
}

export const formatCurrency = formatMoney;

/**
 * Format money strictly as '₹1,250.00' (en-IN with 2 decimal places)
 */
export function formatRupees(amount) {
  if (amount === null || amount === undefined || amount === '') return '₹0.00';
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format payable amount ensuring zero is never displayed as confirmed payable amount.
 * If fare not calculated yet -> "Fare Pending"
 * If payment not due -> "No Payment Due"
 * Display actual amount if valid (> 0)
 */
export function formatPayableAmount(amount, options = {}) {
  const { paymentStatus, tripStatus, notDue = false } = options;
  if (notDue || paymentStatus === 'NO_PAYMENT_DUE' || tripStatus === 'CANCELLED') {
    return 'No Payment Due';
  }
  if (amount === null || amount === undefined || amount === '') {
    if (paymentStatus === 'PAID') return 'Paid';
    return 'Fare Pending';
  }
  const num = Number(amount);
  if (isNaN(num) || num <= 0) {
    if (paymentStatus === 'PAID') return 'Paid';
    return 'Fare Pending';
  }
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Return friendly fuel type label: Petrol, Diesel, CNG, Electric
 */
export function getFuelTypeLabel(fuelType) {
  if (!fuelType) return '—';
  const s = String(fuelType).toUpperCase();
  switch (s) {
    case 'PETROL':
      return 'Petrol';
    case 'DIESEL':
      return 'Diesel';
    case 'CNG':
      return 'CNG';
    case 'ELECTRIC':
      return 'Electric';
    default:
      return fuelType;
  }
}

/**
 * Return quantity unit (L for liquids/gas, or kWh for Electric)
 */
export function getQuantityUnit(fuelType) {
  if (String(fuelType).toUpperCase() === 'ELECTRIC') {
    return 'kWh';
  }
  return 'L';
}

/**
 * Format fuel quantity with appropriate unit: '40 L' or '25 kWh'
 */
export function formatFuelQuantity(quantity, fuelType) {
  if (quantity === null || quantity === undefined || quantity === '') return '—';
  const unit = getQuantityUnit(fuelType);
  const num = Number(quantity);
  const formatted = isNaN(num) ? quantity : num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `${formatted} ${unit}`;
}

/**
 * Format date-time to '12 Oct 2026, 10:30 AM'
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Format date to '12 Oct 2026'
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    return `${day} ${month} ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

const KNOWN_PLACE_ACRONYMS = new Set([
  'WT', 'AP', 'KA', 'DL', 'TS', 'TN', 'MH', 'KL', 'MP', 'UP', 'WB', 'RJ', 'GJ', 'NH', 'SH', 'RTO', 'RC'
]);

/**
 * Convert string to Title Case:
 * Apply Title Case ONLY to words that are:
 * - all lowercase, OR
 * - all uppercase and longer than 4 letters.
 * Keeps words that already contain capitals or are 2 to 3 letters long (WT, AP, KA).
 */
export function toTitleCase(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      if (!word) return '';

      // Normalize known 2 to 3 letter acronyms (e.g. WT, AP, KA, DL)
      const upper = word.toUpperCase();
      if (KNOWN_PLACE_ACRONYMS.has(upper)) {
        return upper;
      }

      // Preserve words that are 2 to 3 characters long if already uppercase/mixed (e.g. "WT", "AP", "DL", "05")
      if (word.length <= 3 && word === word.toUpperCase()) {
        return word;
      }

      // If word already contains capitals mixed with lowercase (e.g. "McDonald", "City"), preserve it
      const hasUpper = /[A-Z]/.test(word);
      const hasLower = /[a-z]/.test(word);
      if (hasUpper && hasLower) {
        return word;
      }

      // If all lowercase: capitalize first letter
      if (!hasUpper) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }

      // If all uppercase and longer than 4 letters (e.g. "TERMINAL" -> "Terminal")
      if (word.length > 4 && word === word.toUpperCase()) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }

      return word;
    })
    .join(' ');
}

export const formatPlaceName = toTitleCase;

/**
 * Format place or display text in clean Title Case without modifying stored data
 */
export function displayText(text) {
  if (text === null || text === undefined || text === '') return '—';
  if (typeof text !== 'string') return String(text);
  return toTitleCase(text);
}

/**
 * Check if an approved booking is overdue (approved, has no trip, travel datetime passed)
 */
export function isBookingOverdue(booking) {
  if (!booking) return false;
  if (booking.status !== 'APPROVED') return false;
  if (booking.trip && (booking.trip.id || booking.trip_id)) return false;
  if (!booking.travel_datetime) return false;
  const travelDate = new Date(booking.travel_datetime);
  return !isNaN(travelDate.getTime()) && travelDate < new Date();
}

/**
 * Return friendly document type label: Medical Certificate, Driving License, Insurance, etc.
 */
export function formatDocType(docType) {
  if (!docType) return '—';
  const s = String(docType).toUpperCase();
  switch (s) {
    case 'MEDICAL_CERTIFICATE':
      return 'Medical Certificate';
    case 'DRIVING_LICENSE':
      return 'Driving License';
    case 'INSURANCE':
      return 'Insurance';
    case 'REGISTRATION_RC':
      return 'Registration (RC)';
    case 'POLLUTION_PUC':
      return 'Pollution (PUC)';
    case 'FITNESS':
      return 'Fitness';
    case 'ROAD_TAX':
      return 'Road Tax';
    case 'PERMIT':
      return 'Permit';
    case 'ID_PROOF':
      return 'ID Proof';
    case 'OTHER':
      return 'Other';
    default:
      return docType.replace(/_/g, ' ');
  }
}

/**
 * Format relative time string: e.g. "in 2h 10m", "in 15m", "2h ago"
 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const target = new Date(dateStr).getTime();
    if (isNaN(target)) return dateStr;
    const now = Date.now();
    const diffMs = target - now;
    const diffSec = Math.round(diffMs / 1000);
    const isPast = diffSec < 0;
    const absSec = Math.abs(diffSec);

    if (absSec < 60) {
      return isPast ? 'just now' : 'in < 1m';
    }
    const mins = Math.floor(absSec / 60);
    if (mins < 60) {
      return isPast ? `${mins}m ago` : `in ${mins}m`;
    }
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) {
      const minPart = remMins > 0 ? ` ${remMins}m` : '';
      return isPast ? `${hours}h${minPart} ago` : `in ${hours}h${minPart}`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    const hourPart = remHours > 0 ? ` ${remHours}h` : '';
    return isPast ? `${days}d${hourPart} ago` : `in ${days}d${hourPart}`;
  } catch (e) {
    return dateStr;
  }
}



