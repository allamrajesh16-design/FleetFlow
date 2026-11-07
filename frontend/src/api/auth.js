import apiClient from './client';

export async function loginApi(credentials) {
  const response = await apiClient.post('/auth/login/', credentials);
  return response.data;
}

export async function registerOptionsApi() {
  const response = await apiClient.get('/auth/register-options/');
  return response.data;
}
export const getRegisterOptionsApi = registerOptionsApi;

export async function registerApi(payload) {
  const response = await apiClient.post('/auth/register/', payload);
  return response.data;
}

export async function verifyOtpApi({ email, otp }) {
  const response = await apiClient.post('/auth/verify-otp/', { email, otp });
  return response.data;
}

export async function resendOtpApi({ email }) {
  const response = await apiClient.post('/auth/resend-otp/', { email });
  return response.data;
}

export async function forgotPasswordApi({ email }) {
  const response = await apiClient.post('/auth/forgot-password/', { email });
  return response.data;
}

export async function verifyResetOtpApi({ email, otp }) {
  const response = await apiClient.post('/auth/forgot-password/verify-otp/', { email, otp });
  return response.data;
}

export async function resetPasswordOtpApi({ reset_token, new_password, confirm_password }) {
  const response = await apiClient.post('/auth/forgot-password/reset/', {
    reset_token,
    new_password,
    confirm_password: confirm_password || new_password,
  });
  return response.data;
}

export async function resetPasswordApi(payload) {
  const body = {
    token: payload.token || payload.reset_token,
    new_password: payload.new_password,
    confirm_password: payload.confirm_password || payload.new_password,
  };
  const response = await apiClient.post('/auth/reset-password/', body);
  return response.data;
}

export async function getProfileApi() {
  const response = await apiClient.get('/auth/profile/');
  return response.data;
}

export async function updateProfileApi(data) {
  const response = await apiClient.put('/auth/profile/', data);
  return response.data;
}

export async function changePasswordApi(data) {
  const response = await apiClient.post('/auth/change-password/', data);
  return response.data;
}

export async function logoutApi(refreshToken) {
  try {
    const response = await apiClient.post('/auth/logout/', { refresh: refreshToken });
    return response.data;
  } catch (err) {
    // Ignore error as specified: blacklisting returns 200 or client ignores
    return null;
  }
}

export async function checkEmailApi(email) {
  const response = await apiClient.post('/auth/check-email/', { email });
  return response.data;
}

