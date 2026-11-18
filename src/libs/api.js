// ============================================================
// Lunglow API client — thin wrapper around fetch.
// Base URL points at the Laravel backend (php artisan serve).
// Token is a Sanctum bearer token persisted in localStorage.
// ============================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';
const TOKEN_KEY = 'lunglow_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, headers = {}, isForm = false } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    credentials: 'include', // also send cookies for stateful Sanctum sessions
  });

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.errors = data?.errors || null; // Laravel 422 validation bag
    throw error;
  }
  return data;
}

export const api = {
  // ---- Auth ----
  register: (payload) => request('/register', { method: 'POST', body: payload }),
  login: (payload) => request('/login', { method: 'POST', body: payload }),
  adminLogin: (payload) => request('/admin/login', { method: 'POST', body: payload }),
  logout: () => request('/logout', { method: 'POST' }),
  me: () => request('/me'),

  // ---- Profile (name, avatar photo, resisted counter) ----
  updateProfile: (payload) => request('/profile', { method: 'PUT', body: payload }),
  uploadAvatar: (formData) => request('/profile/avatar', { method: 'POST', body: formData, isForm: true }),
  resist: () => request('/profile/resist', { method: 'POST' }),

  // ---- Settings / tracker ----
  getSettings: () => request('/settings'),
  saveSettings: (payload) => request('/settings', { method: 'PUT', body: payload }),
  getSmokeLogs: () => request('/smoke-logs'),
  upsertSmokeLog: (payload) => request('/smoke-logs', { method: 'POST', body: payload }),
  getGoals: () => request('/goals'),
  addGoal: (payload) => request('/goals', { method: 'POST', body: payload }),
  deleteGoal: (id) => request(`/goals/${id}`, { method: 'DELETE' }),
  getReminders: () => request('/reminders'),
  updateReminder: (key, payload) => request(`/reminders/${key}`, { method: 'PUT', body: payload }),
  getHeatmap: () => request('/heatmap'),
  toggleHeatmap: (payload) => request('/heatmap/toggle', { method: 'POST', body: payload }),
  logCraving: (payload) => request('/heatmap/log', { method: 'POST', body: payload }),
  getCheckins: () => request('/checkins'),
  checkin: (payload) => request('/checkins', { method: 'POST', body: payload }),

  // ---- Community / Blog ----
  getPosts: () => request('/posts'),
  createPost: (payload) => request('/posts', {
    method: 'POST',
    body: payload,
    isForm: payload instanceof FormData,
  }),
  deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  reactPost: (id, type) => request(`/posts/${id}/react`, { method: 'POST', body: { type } }),
  getBlogs: () => request('/blogs'),
  createBlog: (formData) => request('/blogs', { method: 'POST', body: formData, isForm: true }),
  deleteBlog: (id) => request(`/blogs/${id}`, { method: 'DELETE' }),
  likeBlog: (id) => request(`/blogs/${id}/like`, { method: 'POST' }),
  addComment: (type, id, text) => request(`/comments/${type}/${id}`, { method: 'POST', body: { text } }),
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),

  // ---- Challenges ----
  getChallenges: () => request('/challenges'),
  joinChallenge: (id) => request(`/challenges/${id}/join`, { method: 'POST' }),
  logChallengeDay: (id) => request(`/challenges/${id}/log-day`, { method: 'POST' }),

  // ---- Broadcast ----
  getBroadcast: () => request('/broadcast'),

  // ---- Notifications (persisted history + peak-craving poll) ----
  getNotifications: () => request('/notifications'),
  createNotification: (payload) => request('/notifications', { method: 'POST', body: payload }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
  clearNotifications: () => request('/notifications', { method: 'DELETE' }),
  getDueNotifications: () => request('/notifications/due'),

  // ---- Reports & requests ----
  submitReport: (payload) => request('/reports', { method: 'POST', body: payload }),
  getMyRequests: () => request('/requests'),
  submitRequest: (payload) => request('/requests', { method: 'POST', body: payload }),

  // ---- Admin ----
  admin: {
    analytics: () => request('/admin/analytics/overview'),
    users: (search = '') => request(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    toggleUserStatus: (id) => request(`/admin/users/${id}/toggle-status`, { method: 'POST' }),
    resetUserAvatar: (id) => request(`/admin/users/${id}/reset-avatar`, { method: 'POST' }),
    reports: () => request('/admin/reports'),
    resolveReport: (id, action) => request(`/admin/reports/${id}/resolve`, { method: 'POST', body: { action } }),
    requests: () => request('/admin/requests'),
    updateRequestStatus: (id, status) => request(`/admin/requests/${id}/status`, { method: 'POST', body: { status } }),
    deleteRequest: (id) => request(`/admin/requests/${id}`, { method: 'DELETE' }),
    publishBroadcast: (message) => request('/admin/broadcast', { method: 'POST', body: { message } }),
    clearBroadcast: () => request('/admin/broadcast', { method: 'DELETE' }),
    createChallenge: (formData) => request('/admin/challenges', { method: 'POST', body: formData, isForm: true }),
    updateChallenge: (id, formData) => request(`/admin/challenges/${id}`, { method: 'POST', body: formData, isForm: true }), // POST + _method=PUT for file uploads
    deleteChallenge: (id) => request(`/admin/challenges/${id}`, { method: 'DELETE' }),
  },
};

export default api;

// Convert a base64 data URL (from FileReader.readAsDataURL) into a File
// so it can be uploaded through FormData.
export function dataUrlToFile(dataUrl, filename = 'upload.png') {
  try {
    const [meta, b64] = dataUrl.split(',');
    const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/png';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}
