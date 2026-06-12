import api from './client';

export const archiveApi = {
  list: () => api.get('/archive').then(r => r.data),
  getMonth: (monthKey) => api.get(`/archive/${monthKey}`).then(r => r.data),
  closeMonth: () => api.post('/archive/close-month').then(r => r.data),
  remove: (monthKey) => api.delete(`/archive/${monthKey}`).then(r => r.data),
};
