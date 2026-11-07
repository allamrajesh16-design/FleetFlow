import apiClient from './client';

export async function listExpensesApi(params) {
  const res = await apiClient.get('/expenses/', { params });
  return res.data;
}

export async function getExpenseSummaryApi(params) {
  const res = await apiClient.get('/expenses/summary/', { params });
  return res.data;
}

export async function getExpenseApi(id) {
  const res = await apiClient.get(`/expenses/${id}/`);
  return res.data;
}

export async function createExpenseApi(data) {
  const isFormData = data instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await apiClient.post('/expenses/', data, config);
  return res.data;
}

export async function updateExpenseApi(id, data) {
  const isFormData = data instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await apiClient.patch(`/expenses/${id}/`, data, config);
  return res.data;
}

export async function deleteExpenseApi(id) {
  const res = await apiClient.delete(`/expenses/${id}/`);
  return res.data;
}

export async function approveExpenseApi(id) {
  const res = await apiClient.post(`/expenses/${id}/approve/`);
  return res.data;
}

export async function rejectExpenseApi(id, reason) {
  const res = await apiClient.post(`/expenses/${id}/reject/`, { reason });
  return res.data;
}

export function getExpenseReceiptUrl(id) {
  return `/expenses/${id}/download/`;
}
