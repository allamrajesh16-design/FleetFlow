import apiClient from './client';

/**
 * Driver Dashboard Metrics: today's trips, upcoming trip, completed trips, total distance, current trip
 */
export async function getDriverDashboardApi() {
  const response = await apiClient.get('/dashboard/driver/');
  return response.data;
}

/**
 * Logged-in Driver profile: license number, license expiry, status, user details
 */
export async function getDriverMeApi() {
  const response = await apiClient.get('/drivers/me/');
  return response.data;
}

/**
 * Driver Trips list with optional status filter (e.g. 'upcoming', 'in_progress', 'completed') and search
 */
export async function getMyTripsApi(status, search = '') {
  const params = {};
  if (status && status !== 'all') {
    params.status = status;
  }
  if (search && search.trim()) {
    params.search = search.trim();
  }
  const response = await apiClient.get('/trips/my-trips/', { params });
  return response.data;
}

/**
 * Driver Trips summary statistics (total, upcoming, in_progress, completed, cancelled)
 */
export async function getMyTripsSummaryApi() {
  const response = await apiClient.get('/trips/my-trips-summary/');
  return response.data;
}

/**
 * Single trip details
 */
export async function getTripDetailsApi(id) {
  const response = await apiClient.get(`/trips/${id}/`);
  return response.data;
}

/**
 * Start a scheduled trip with optional starting odometer reading
 */
export async function startTripApi(id, startOdometer) {
  const payload = {};
  if (startOdometer !== undefined && startOdometer !== null && startOdometer !== '') {
    payload.start_odometer = Number(startOdometer);
  }
  const response = await apiClient.post(`/trips/${id}/start/`, payload);
  return response.data;
}

/**
 * Complete an in-progress trip with ending odometer reading
 */
export async function completeTripApi(id, endOdometer) {
  const response = await apiClient.post(`/trips/${id}/complete/`, {
    end_odometer: Number(endOdometer),
  });
  return response.data;
}

/**
 * Preview trip fare with live distance / odometer
 */
export async function getTripFarePreviewApi(id, params) {
  const response = await apiClient.get(`/trips/${id}/fare-preview/`, { params });
  return response.data;
}

/**
 * Complete trip with distance and/or end odometer
 */
export async function completeTripWithDistanceApi(id, data) {
  const response = await apiClient.post(`/trips/${id}/complete/`, data);
  return response.data;
}

/**
 * Collect CASH or ONLINE payment for completed trip
 */
export async function collectPaymentApi(paymentId, data) {
  const payload = {
    method: data.method || data.payment_method || 'CASH',
    ...data,
  };
  const response = await apiClient.post(`/payments/${paymentId}/collect/`, payload);
  return response.data;
}

/**
 * Settle cash payment with driver
 */
export async function settleCashPaymentApi(paymentId) {
  const response = await apiClient.post(`/payments/${paymentId}/settle-cash/`);
  return response.data;
}

/**
 * Send driver GPS location update during in-progress trip
 */
export async function sendTripLocationApi(id, latitude, longitude, extra = {}) {
  const payload = {
    latitude: Number(latitude).toFixed(6),
    longitude: Number(longitude).toFixed(6),
  };
  if (extra.speed_kmh != null) payload.speed_kmh = Number(extra.speed_kmh);
  if (extra.heading != null && !isNaN(extra.heading)) payload.heading = Number(extra.heading);
  if (extra.accuracy_m != null) payload.accuracy_m = Number(extra.accuracy_m);
  if (extra.is_simulated != null) payload.is_simulated = Boolean(extra.is_simulated);

  const response = await apiClient.post(`/trips/${id}/location/`, payload);
  return response.data;
}

/**
 * Get payments associated with a specific trip
 */
export async function getTripPaymentsApi(tripId) {
  const response = await apiClient.get('/payments/', {
    params: { trip: tripId },
  });
  return response.data;
}

/**
 * Get the active system-wide Payment QR configuration
 */
export async function getPaymentQrSettingApi() {
  const response = await apiClient.get('/payments/qr-setting/');
  return response.data;
}

/**
 * Confirm customer's submitted payment proof
 */
export async function confirmPaymentApi(paymentId) {
  const response = await apiClient.post(`/payments/${paymentId}/confirm/`);
  return response.data;
}

/**
 * Reject customer's payment proof with explanation reason
 */
export async function rejectPaymentProofApi(paymentId, reason) {
  const response = await apiClient.post(`/payments/${paymentId}/reject-proof/`, {
    reason,
  });
  return response.data;
}

/**
 * Download official PDF receipt as a Blob
 */
export async function downloadReceiptPdfApi(paymentId) {
  const response = await apiClient.get(`/payments/${paymentId}/receipt/pdf/`, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Download official PDF receipt for a trip as a Blob
 */
export async function downloadTripReceiptPdfApi(tripId) {
  const response = await apiClient.get(`/trips/${tripId}/receipt/pdf/`, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Driver Trip History with pagination & filters
 */
export async function getTripHistoryApi(params = {}) {
  const response = await apiClient.get('/trips/history/', { params });
  return response.data;
}
