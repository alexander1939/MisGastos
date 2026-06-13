import api from './client';

export const purchasesApi = {
  list: (params) => api.get('/purchases', { params }).then(r => r.data),
  stats: () => api.get('/purchases/stats').then(r => r.data),
  create: (data) => api.post('/purchases', data).then(r => r.data),
  update: (id, data) => api.put(`/purchases/${id}`, data).then(r => r.data),
  updateStatus: (id, status) => api.put(`/purchases/${id}/status`, { status }).then(r => r.data),
  remove: (id) => api.delete(`/purchases/${id}`).then(r => r.data),
  payCard: (data) => api.post('/purchases/pay-card', data).then(r => r.data),
};
