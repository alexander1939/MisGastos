import api from './client';

export const transfersApi = {
  list: () => api.get('/transfers').then(r => r.data),
  create: (data) => api.post('/transfers', data).then(r => r.data),
  remove: (id) => api.delete(`/transfers/${id}`).then(r => r.data),
};
