import axios from 'axios';
import toast from 'react-hot-toast';
import { getErrorMessage } from './errors';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gc_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth and plan errors globally
let planToastAt = 0;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const path: string = err.config?.url ?? '';

    // 401 — session gone. Don't bounce on the credential endpoints themselves:
    // a wrong password there is an expected answer, not an expired session.
    if (status === 401) {
      const isCredentialCall = /\/auth\/(login|register|forgot-password|reset-password)/.test(path);
      if (!isCredentialCall) {
        localStorage.removeItem('gc_token');
        localStorage.removeItem('gc_user');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }

    // 403 — authenticated but the property is suspended/pending/rejected. The
    // token stays valid for days, so without this the whole app silently renders
    // empty states and the user is told nothing.
    // 402 — a plan limit. Surface both, throttled so a burst of parallel
    // queries doesn't stack identical toasts.
    if (status === 403 || status === 402) {
      const now = Date.now();
      if (now - planToastAt > 4000) {
        planToastAt = now;
        toast.error(getErrorMessage(err), { duration: 6000 });
      }
    }

    return Promise.reject(err);
  }
);

export default api;
