import apiClient from './client';

// ==========================================
// DASHBOARDS
// ==========================================
export async function getAdminDashboardApi() {
  const res = await apiClient.get('/dashboard/admin/');
  return res.data;
}

export async function getFleetManagerDashboardApi() {
  const res = await apiClient.get('/dashboard/fleet-manager/');
  return res.data;
}

// ==========================================
// USERS & ROLES
// ==========================================
export async function listUsersApi(params) {
  const res = await apiClient.get('/users/', { params });
  return res.data;
}

export async function createUserApi(payload) {
  const res = await apiClient.post('/users/', payload);
  return res.data;
}

export async function updateUserApi(id, payload) {
  const res = await apiClient.patch(`/users/${id}/`, payload);
  return res.data;
}

export async function activateUserApi(id) {
  const res = await apiClient.post(`/users/${id}/activate/`);
  return res.data;
}

export async function deactivateUserApi(id) {
  const res = await apiClient.post(`/users/${id}/deactivate/`);
  return res.data;
}

// ==========================================
// REGISTRATION APPROVALS
// ==========================================
export async function listApprovalsApi(params) {
  const res = await apiClient.get('/auth/approvals/', { params });
  return res.data;
}

export async function approveUserApi(id) {
  const res = await apiClient.post(`/auth/approvals/${id}/approve/`);
  return res.data;
}

export async function rejectUserApi(id, reason) {
  const res = await apiClient.post(`/auth/approvals/${id}/reject/`, { reason });
  return res.data;
}

export async function resendDecisionEmailApi(id) {
  const res = await apiClient.post(`/auth/approvals/${id}/resend-decision-email/`);
  return res.data;
}

// ==========================================
// VEHICLES & FLEET
// ==========================================
export async function listVehiclesApi(params) {
  const res = await apiClient.get('/vehicles/', { params });
  return res.data;
}

export async function createVehicleApi(payload) {
  const res = await apiClient.post('/vehicles/', payload);
  return res.data;
}

export async function updateVehicleApi(id, payload) {
  const res = await apiClient.patch(`/vehicles/${id}/`, payload);
  return res.data;
}

export async function deleteVehicleApi(id) {
  const res = await apiClient.delete(`/vehicles/${id}/`);
  return res.data;
}

export async function getVehicleApi(id) {
  const res = await apiClient.get(`/vehicles/${id}/`);
  return res.data;
}

// ==========================================
// DRIVERS
// ==========================================
export async function listDriversApi(params) {
  const res = await apiClient.get('/drivers/', { params });
  return res.data;
}

export async function getDriverApi(id) {
  const res = await apiClient.get(`/drivers/${id}/`);
  return res.data;
}

export async function createDriverApi(payload) {
  const res = await apiClient.post('/drivers/', payload);
  return res.data;
}

export async function updateDriverApi(id, payload) {
  const res = await apiClient.patch(`/drivers/${id}/`, payload);
  return res.data;
}

export async function deleteDriverApi(id) {
  const res = await apiClient.delete(`/drivers/${id}/`);
  return res.data;
}

// ==========================================
// BOOKINGS & APPROVALS
// ==========================================
export async function listBookingsApi(params) {
  const res = await apiClient.get('/bookings/', { params });
  return res.data;
}

export async function getBookingApi(id) {
  const res = await apiClient.get(`/bookings/${id}/`);
  return res.data;
}

export async function approveBookingApi(id, vehicleId = null) {
  const payload = vehicleId ? { vehicle_id: vehicleId } : {};
  const res = await apiClient.post(`/bookings/${id}/approve/`, payload);
  return res.data;
}

export async function rejectBookingApi(id, reason) {
  const res = await apiClient.post(`/bookings/${id}/reject/`, {
    rejection_reason: reason,
  });
  return res.data;
}

export async function cancelBookingApi(id, reason = 'Cancelled by Fleet Manager') {
  const res = await apiClient.post(`/bookings/${id}/cancel/`, {
    cancel_reason: reason,
  });
  return res.data;
}

// ==========================================
// BUS SCHEDULES & PASSENGER MONITOR
// ==========================================
export async function listBusSchedulesApi(params) {
  const res = await apiClient.get('/bus-schedules/', { params });
  return res.data;
}

export async function createBusScheduleApi(payload) {
  const res = await apiClient.post('/bus-schedules/', payload);
  return res.data;
}

export async function updateBusScheduleApi(id, payload) {
  const res = await apiClient.patch(`/bus-schedules/${id}/`, payload);
  return res.data;
}

export async function deleteBusScheduleApi(id) {
  const res = await apiClient.delete(`/bus-schedules/${id}/`);
  return res.data;
}

// ==========================================
// TRIPS & ASSIGNMENTS & LIVE MONITORING
// ==========================================
export async function listTripsApi(params) {
  const res = await apiClient.get('/trips/', { params });
  return res.data;
}

export async function getTripApi(id) {
  const res = await apiClient.get(`/trips/${id}/`);
  return res.data;
}

export async function assignTripApi(payload) {
  const res = await apiClient.post('/trips/assign/', payload);
  return res.data;
}

export async function getAssignableResourcesApi(params) {
  const res = await apiClient.get('/trips/assignable/', { params });
  return res.data;
}

export async function getDispatchSummaryApi(params) {
  const res = await apiClient.get('/trips/dispatch-summary/', { params });
  return res.data;
}

export async function reassignTripApi(id, payload) {
  const res = await apiClient.post(`/trips/${id}/reassign/`, payload);
  return res.data;
}

export async function cancelTripApi(id, reason = '') {
  const res = await apiClient.post(`/trips/${id}/cancel/`, { reason });
  return res.data;
}

export async function getLiveTripsApi() {
  const res = await apiClient.get('/trips/live/');
  return res.data;
}

// ==========================================
// MAINTENANCE
// ==========================================
export async function listMaintenanceApi(params) {
  const res = await apiClient.get('/maintenance/', { params });
  return res.data;
}

export async function createMaintenanceApi(payload) {
  const res = await apiClient.post('/maintenance/', payload);
  return res.data;
}

export async function updateMaintenanceApi(id, payload) {
  const res = await apiClient.patch(`/maintenance/${id}/`, payload);
  return res.data;
}

// ==========================================
// PAYMENTS & QR SETTING
// ==========================================
export async function listPaymentsApi(params) {
  const res = await apiClient.get('/payments/', { params });
  return res.data;
}

export async function getPaymentSummaryApi() {
  const res = await apiClient.get('/payments/summary/');
  return res.data;
}

export async function confirmPaymentApi(id) {
  const res = await apiClient.post(`/payments/${id}/confirm/`);
  return res.data;
}

export async function rejectPaymentProofApi(id, reason) {
  const res = await apiClient.post(`/payments/${id}/reject-proof/`, { reason });
  return res.data;
}

export async function refundPaymentApi(id) {
  const res = await apiClient.post(`/payments/${id}/refund/`);
  return res.data;
}

export async function settleCashPaymentApi(id) {
  const res = await apiClient.post(`/payments/${id}/settle-cash/`);
  return res.data;
}

export async function getQrSettingApi() {
  const res = await apiClient.get('/payments/qr-setting/');
  return res.data;
}

export async function uploadQrSettingApi(formData) {
  const res = await apiClient.post('/payments/qr-setting/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function downloadReceiptPdfApi(paymentId, receiptNumber) {
  const res = await apiClient.get(`/payments/${paymentId}/receipt/pdf/`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `receipt_${receiptNumber || paymentId}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
}

// ==========================================
// REPORTS & CSV EXPORTS
// ==========================================
export async function getReportApi(reportType, params) {
  // reportType: 'bookings' | 'trips' | 'payments' | 'vehicle-utilization'
  const res = await apiClient.get(`/reports/${reportType}/`, { params });
  return res.data;
}

export async function downloadReportCsvApi(reportType, params, filename) {
  const csvParams = { ...params, format: 'csv' };
  const res = await apiClient.get(`/reports/${reportType}/`, {
    params: csvParams,
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename || `${reportType}_report.csv`);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
}
