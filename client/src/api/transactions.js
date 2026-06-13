import api from './client';

export const transactionsApi = {
  list: (params) => api.get('/transactions', { params }).then(r => r.data),
  summary: (params) => api.get('/transactions/summary', { params }).then(r => r.data),
  create: (data) => api.post('/transactions', data).then(r => r.data),
  update: (id, data) => api.put(`/transactions/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/transactions/${id}`).then(r => r.data),
  importCsv: (rows) => api.post('/transactions/import', { rows }).then(r => r.data),
  accountBalance: () => api.get('/transactions/account-balance').then(r => r.data),
};
