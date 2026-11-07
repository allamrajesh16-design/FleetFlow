import apiClient from './client';

export async function listDocumentsApi(params) {
  const res = await apiClient.get('/documents/', { params });
  return res.data;
}

export async function getExpiringDocumentsApi() {
  const res = await apiClient.get('/documents/expiring/');
  return res.data;
}

export async function getDocumentApi(id) {
  const res = await apiClient.get(`/documents/${id}/`);
  return res.data;
}

export async function createDocumentApi(data) {
  const isFormData = data instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await apiClient.post('/documents/', data, config);
  return res.data;
}

export async function updateDocumentApi(id, data) {
  const isFormData = data instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await apiClient.patch(`/documents/${id}/`, data, config);
  return res.data;
}

export async function deleteDocumentApi(id) {
  const res = await apiClient.delete(`/documents/${id}/`);
  return res.data;
}

export async function approveDocumentApi(id) {
  const res = await apiClient.post(`/documents/${id}/approve/`);
  return res.data;
}

export async function rejectDocumentApi(id, rejection_reason) {
  const res = await apiClient.post(`/documents/${id}/reject/`, { rejection_reason });
  return res.data;
}

export async function getMyTargetsApi() {
  const res = await apiClient.get('/documents/my-targets/');
  return res.data;
}

export function getDocumentDownloadUrl(id) {
  return `/documents/${id}/download/`;
}
