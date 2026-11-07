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
 * Driver Trips list with optional status filter (e.g. 'upcoming', 'in_progress', 'completed')
 */
export async function getMyTripsApi(status) {
  const params = {};
  if (status && status !== 'all') {
    params.status = status;
  }
  const response = await apiClient.get('/trips/my-trips/', { params });
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
 * Start a scheduled trip with starting odometer reading
 */
export async function startTripApi(id, startOdometer) {
  const response = await apiClient.post(`/trips/${id}/start/`, {
    start_odometer: Number(startOdometer),
  });
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
 * Send driver GPS location update during in-progress trip
 */
export async function sendTripLocationApi(id, latitude, longitude) {
  const response = await apiClient.post(`/trips/${id}/location/`, {
    latitude: Number(latitude).toFixed(6),
    longitude: Number(longitude).toFixed(6),
  });
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
 * Driver Trip History with pagination & filters
 */
export async function getTripHistoryApi(params = {}) {
  const response = await apiClient.get('/trips/history/', { params });
  return response.data;
}
