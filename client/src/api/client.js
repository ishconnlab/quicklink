import axios from 'axios';

const TOKEN_KEY = 'quicklink.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

// Normalises backend errors into a predictable shape for the UI.
export function apiError(error) {
  if (error.code === 'ERR_NETWORK' || !error.response) {
    return {
      message: 'You appear to be offline. The request could not reach the server.',
      offline: true,
      details: null,
    };
  }
  const body = error.response.data;
  return {
    message: body?.error?.message || error.message || 'Something went wrong',
    details: body?.error?.details || null,
    status: error.response.status,
  };
}

export default api;
