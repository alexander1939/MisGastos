import api from './client';

export const calendarApi = {
  list: (params) => api.get('/calendar', { params }).then(r => r.data),
  upcoming: () => api.get('/calendar/upcoming').then(r => r.data),
  create: (data) => api.post('/calendar', data).then(r => r.data),
  update: (id, data) => api.put(`/calendar/${id}`, data).then(r => r.data),
  toggleDone: (id) => api.put(`/calendar/${id}/done`).then(r => r.data),
  remove: (id) => api.delete(`/calendar/${id}`).then(r => r.data),
};
