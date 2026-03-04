import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export async function startScan(data) {
  return api.post('/scans', data);
}

export async function getScan(id) {
  return api.get(`/scans/${id}`);
}

export async function getScans() {
  return api.get('/scans');
}

export async function getScanDependencies(id) {
  return api.get(`/scans/${id}/dependencies`);
}

export default api;
