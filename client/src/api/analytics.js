import api from './client';

export const analyticsApi = {
  byCategory: (params) => api.get('/analytics/by-category', { params }).then(r => r.data),
  byMethod: (params) => api.get('/analytics/by-method', { params }).then(r => r.data),
  trend: (params) => api.get('/analytics/trend', { params }).then(r => r.data),
  cardsDebt: () => api.get('/analytics/cards-debt').then(r => r.data),
  monthlyComparison: (params) => api.get('/analytics/monthly-comparison', { params }).then(r => r.data),
};
