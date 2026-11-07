import apiClient from './client';

export async function listFuelLogsApi(params) {
  const res = await apiClient.get('/fuel/', { params });
  return res.data;
}

export async function getFuelSummaryApi(params) {
  const res = await apiClient.get('/fuel/summary/', { params });
  return res.data;
}

export async function getFuelLogApi(id) {
  const res = await apiClient.get(`/fuel/${id}/`);
  return res.data;
}

export async function createFuelLogApi(data) {
  const isFormData = data instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await apiClient.post('/fuel/', data, config);
  return res.data;
}

export async function updateFuelLogApi(id, data) {
  const isFormData = data instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await apiClient.patch(`/fuel/${id}/`, data, config);
  return res.data;
}

export async function deleteFuelLogApi(id) {
  const res = await apiClient.delete(`/fuel/${id}/`);
  return res.data;
}

export async function approveFuelLogApi(id) {
  const res = await apiClient.post(`/fuel/${id}/approve/`);
  return res.data;
}

export async function rejectFuelLogApi(id, rejection_reason) {
  const res = await apiClient.post(`/fuel/${id}/reject/`, { rejection_reason });
  return res.data;
}

export function getFuelReceiptUrl(id) {
  return `/fuel/${id}/download/`;
}
