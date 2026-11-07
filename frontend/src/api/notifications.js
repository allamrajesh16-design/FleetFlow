import apiClient from './client';

export async function getNotificationsApi() {
  const response = await apiClient.get('/notifications/');
  return response.data;
}

export async function markNotificationReadApi(id) {
  const response = await apiClient.post(`/notifications/${id}/read/`);
  return response.data;
}

export async function markAllNotificationsReadApi() {
  const response = await apiClient.post('/notifications/read-all/');
  return response.data;
}
