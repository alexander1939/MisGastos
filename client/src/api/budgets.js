import api from './client';

export const budgetsApi = {
  list: () => api.get('/budgets').then(r => r.data),
  upsert: (items) => api.put('/budgets', { items }).then(r => r.data),
  status: () => api.get('/budgets/status').then(r => r.data),
};
