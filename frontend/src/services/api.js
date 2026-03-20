import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle expired/invalid sessions globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getZoneSuggestion: (data) => api.post('/auth/zone-suggestion', data),
};

// User APIs
export const userAPI = {
  getProfile: () => api.get('/user/profile'),
  getIncomeDna: () => api.get('/user/income-dna'),
  updateProfile: (data) => api.put('/user/profile', data),
  deleteMe: () => api.delete('/user/me'),
  logEarnings: (data) => api.post('/user/log-earnings', data),
};

// Policy APIs
export const policyAPI = {
  createPolicy: () => api.post('/policy/create'),
  getActivePolicy: () => api.get('/policy/active'),
  getPolicyBreakdown: () => api.get('/policy/breakdown'),
  renewPolicy: () => api.post('/policy/renew'),
};

// Claim APIs
export const claimAPI = {
  testTrigger: (data) => api.post('/claim/test-trigger', data),
  getHistory: () => api.get('/claim/history'),
  getDetails: (claimId) => api.get(`/claim/${claimId}`),
  checkTriggers: (city, autoProcess = false) => api.get('/claim/check/triggers', { params: { city, autoProcess } }),
  getPredictions: (city) => api.get('/claim/predict/disruptions', { params: { city } }),
};

// Admin APIs
export const adminAPI = {
  getClaimStats: () => api.get('/admin/claims/stats'),
  getFraudAlerts: () => api.get('/admin/claims/fraud-alerts'),
  runDemoScenario: (data) => api.post('/admin/demo/run', data),
  getClaimUserHistory: (claimId) => api.get(`/admin/claims/${claimId}/history`),
  reviewClaimDecision: (claimId, data) => api.patch(`/admin/claims/${claimId}/decision`, data),
};

export default api;
