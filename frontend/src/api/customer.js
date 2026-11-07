import apiClient from './client';

/**
 * Customer Dashboard summary metrics: total bookings, upcoming trips, pending payments, recent bookings
 */
export async function getCustomerDashboardApi() {
  const response = await apiClient.get('/dashboard/customer/');
  return response.data;
}

/**
 * List active vehicles for booking selection with optional filters (e.g. vehicle_type)
 */
export async function getActiveVehiclesApi(params = {}) {
  const response = await apiClient.get('/vehicles/', {
    params: { status: 'ACTIVE', ...params },
  });
  return response.data;
}

/**
 * List open or confirmed bus schedules for passenger booking
 */
export async function getBusSchedulesApi(params = {}) {
  const response = await apiClient.get('/bus-schedules/', { params });
  return response.data;
}

/**
 * Get details of a single bus schedule
 */
export async function getSingleBusScheduleApi(id) {
  const response = await apiClient.get(`/bus-schedules/${id}/`);
  return response.data;
}

/**
 * Create a new vehicle or bus seat booking
 */
export async function createBookingApi(payload) {
  const response = await apiClient.post('/bookings/', payload);
  return response.data;
}

/**
 * Customer's bookings list with optional status and search filters
 */
export async function getMyBookingsApi(params = {}) {
  const response = await apiClient.get('/bookings/', { params });
  return response.data;
}

/**
 * Single booking details
 */
export async function getBookingDetailsApi(id) {
  const response = await apiClient.get(`/bookings/${id}/`);
  return response.data;
}

/**
 * Real-time live trip tracking details for customer booking
 */
export async function getBookingTrackingApi(id) {
  const response = await apiClient.get(`/bookings/${id}/tracking/`);
  return response.data;
}

/**
 * Cancel an owned booking before travel datetime
 */
export async function cancelBookingApi(id, cancel_reason = 'Cancelled by customer') {
  const response = await apiClient.post(`/bookings/${id}/cancel/`, {
    cancel_reason,
  });
  return response.data;
}

/**
 * Respond to cancelled bus schedule with option choice (ALTERNATIVE_VEHICLE, CANCEL, REFUND)
 */
export async function respondToBusOptionApi(id, choice) {
  const response = await apiClient.post(`/bookings/${id}/bus-response/`, {
    choice,
  });
  return response.data;
}

/**
 * Retrieve payment pay-info (amount, active static QR image URL, route, vehicle, driver name)
 */
export async function getPaymentPayInfoApi(paymentId) {
  const response = await apiClient.get(`/payments/${paymentId}/pay-info/`);
  return response.data;
}

/**
 * Submit payment proof (transaction reference and optional screenshot image)
 */
export async function submitPaymentProofApi(paymentId, formData) {
  const response = await apiClient.post(
    `/payments/${paymentId}/submit-proof/`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
}

/**
 * Retrieve payment status / details
 */
export async function getPaymentDetailsApi(paymentId) {
  const response = await apiClient.get(`/payments/${paymentId}/`);
  return response.data;
}

/**
 * Retrieve issued receipt details
 */
export async function getPaymentReceiptApi(paymentId) {
  const response = await apiClient.get(`/payments/${paymentId}/receipt/`);
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
 * Customer payment history with filters & pagination
 */
export async function getPaymentHistoryApi(params = {}) {
  const response = await apiClient.get('/payments/history/', { params });
  return response.data;
}
