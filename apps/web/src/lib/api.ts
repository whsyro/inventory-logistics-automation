import axios from 'axios';

const TOKEN_KEY = 'ila_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export const api = axios.create({
  baseURL: '/api',
});

// Attach the JWT to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear token and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** Extract a human-friendly message from an axios error, including field details. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; details?: Record<string, string[]> } | undefined;
    const base = data?.error ?? err.message;
    // Zod validation errors include per-field messages — surface them.
    if (data?.details && typeof data.details === 'object') {
      const fields = Object.entries(data.details)
        .filter(([, msgs]) => Array.isArray(msgs) && msgs.length)
        .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`);
      if (fields.length) return `${base} — ${fields.join('; ')}`;
    }
    return base;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
