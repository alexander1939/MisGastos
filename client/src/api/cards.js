import api from './client';

export const cardsApi = {
  list: () => api.get('/cards').then(r => r.data),
  create: (data) => api.post('/cards', data).then(r => r.data),
  update: (id, data) => api.put(`/cards/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/cards/${id}`).then(r => r.data),
  summary: (id) => api.get(`/cards/${id}/summary`).then(r => r.data),
  exportCsv: () => api.get('/cards/export', { responseType: 'text' }).then(r => r.data),
  importCsv: (rows) => api.post('/cards/import', { rows }).then(r => r.data),
};
