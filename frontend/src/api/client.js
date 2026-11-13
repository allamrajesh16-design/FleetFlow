import axios from 'axios';
import {
  getStoredToken,
  clearFleetFlowStorage,
  touchLastActive,
} from '../utils/authStorage';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export { getStoredToken, clearFleetFlowStorage, touchLastActive };

// Global request counter for measuring page request counts
if (typeof window !== 'undefined') {
  window.__FLEETFLOW_REQUEST_COUNT = window.__FLEETFLOW_REQUEST_COUNT || 0;
  window.__FLEETFLOW_REQUEST_LOG = window.__FLEETFLOW_REQUEST_LOG || [];
}

export function getRequestCount() {
  if (typeof window !== 'undefined') {
    return window.__FLEETFLOW_REQUEST_COUNT || 0;
  }
  return 0;
}

export function resetRequestCount() {
  if (typeof window !== 'undefined') {
    window.__FLEETFLOW_REQUEST_COUNT = 0;
    window.__FLEETFLOW_REQUEST_LOG = [];
  }
}

// Request interceptor: attach JWT access token and count requests
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      window.__FLEETFLOW_REQUEST_COUNT = (window.__FLEETFLOW_REQUEST_COUNT || 0) + 1;
      window.__FLEETFLOW_REQUEST_LOG.push({
        id: window.__FLEETFLOW_REQUEST_COUNT,
        url: config.url,
        method: config.method,
        time: Date.now(),
      });
      if (process.env.REACT_APP_DEBUG_REQUESTS === 'true') {
        console.log(`[API Request #${window.__FLEETFLOW_REQUEST_COUNT}] ${config.method?.toUpperCase()} ${config.url}`);
      }
    }
    const token = getStoredToken('fleetflow_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: auto-refresh token on 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and request has not been retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Do not try to refresh if request was to login or refresh endpoints
      if (
        originalRequest.url?.includes('/auth/login/') ||
        originalRequest.url?.includes('/auth/token/refresh/')
      ) {
        if (originalRequest.url?.includes('/auth/token/refresh/')) {
          clearFleetFlowStorage();
          window.dispatchEvent(
            new CustomEvent('fleetflow_auth_logout', {
              detail: { message: 'Your session expired. Please login again.' },
            })
          );
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.replace('/login?expired=1');
          }
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getStoredToken('fleetflow_refresh_token');
      const isRemembered = localStorage.getItem('fleetflow_remember') === 'true';

      if (!refreshToken) {
        isRefreshing = false;
        clearFleetFlowStorage();
        window.dispatchEvent(
          new CustomEvent('fleetflow_auth_logout', {
            detail: { message: 'Your session expired. Please login again.' },
          })
        );
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.replace('/login?expired=1');
        }
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = data.access;
        const targetStorage = isRemembered ? localStorage : sessionStorage;
        targetStorage.setItem('fleetflow_access_token', newAccessToken);

        if (data.refresh) {
          targetStorage.setItem('fleetflow_refresh_token', data.refresh);
        }
        touchLastActive();

        apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearFleetFlowStorage();
        window.dispatchEvent(
          new CustomEvent('fleetflow_auth_logout', {
            detail: { message: 'Your session expired. Please login again.' },
          })
        );
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.replace('/login?expired=1');
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 401) {
      clearFleetFlowStorage();
      window.dispatchEvent(
        new CustomEvent('fleetflow_auth_logout', {
          detail: { message: 'Your session expired. Please login again.' },
        })
      );
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.replace('/login?expired=1');
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Turns backend DRF error responses into a clear, single readable message.
 */
export function getErrorMessage(error) {
  if (!error) return 'An unexpected error occurred.';

  // Timeout or network-connection errors — show friendly message
  if (
    error.code === 'ECONNABORTED' ||
    error.code === 'ERR_NETWORK' ||
    (error.message && error.message.toLowerCase().includes('timeout'))
  ) {
    return 'Unable to reach the server. Please make sure the backend is running and try again.';
  }

  const responseData = error.response?.data;
  if (!responseData) {
    if (error.message === 'Network Error') {
      return 'Unable to connect to the backend server. Please verify the backend is running.';
    }
    return error.message || 'An unexpected error occurred.';
  }

  // Handle specific backend error formats
  if (typeof responseData === 'string') {
    return responseData;
  }

  if (responseData.detail) {
    return responseData.detail;
  }

  if (responseData.message) {
    return responseData.message;
  }

  if (responseData.error) {
    return typeof responseData.error === 'string'
      ? responseData.error
      : JSON.stringify(responseData.error);
  }

  if (responseData.non_field_errors) {
    return Array.isArray(responseData.non_field_errors)
      ? responseData.non_field_errors.join(' ')
      : responseData.non_field_errors;
  }

  // Field errors: e.g. { email: ["A user with this email already exists."] }
  const firstKey = Object.keys(responseData)[0];
  if (firstKey) {
    const val = responseData[firstKey];
    const fieldName = firstKey.replace(/_/g, ' ');
    const msg = Array.isArray(val) ? val.join(' ') : String(val);
    return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}: ${msg}`;
  }

  return 'Operation failed. Please verify your inputs.';
}

export const getApiErrorMessage = getErrorMessage;

export default apiClient;
