import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Required for httpOnly auth cookies
});

/**
 * Upload package.json and lockfile as multipart form data.
 * @param {File} packageJsonFile
 * @param {File} lockfileFile
 */
export async function uploadScan(packageJsonFile, lockfileFile) {
  const formData = new FormData();
  formData.append('packageJson', packageJsonFile);
  formData.append('lockfile', lockfileFile);
  return api.post('/scans/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/**
 * Scan a GitHub repository by URL.
 * @param {string} repoUrl
 */
export async function scanGitHub(repoUrl) {
  return api.post('/scans/github', { repoUrl });
}

/**
 * Get paginated scan history.
 * @param {number} page
 * @param {number} limit
 */
export async function getScans(page = 1, limit = 10) {
  return api.get('/scans', { params: { page, limit } });
}

/**
 * Get full details for a single scan.
 * @param {string} id
 */
export async function getScanById(id) {
  return api.get(`/scans/${id}`);
}

// Backward-compatible aliases
export async function startScan(data) {
  return api.post('/scans', data);
}

export async function getScan(id) {
  return getScanById(id);
}

export async function getScanDependencies(id) {
  return api.get(`/scans/${id}/dependencies`);
}

/**
 * Download an SBOM file for a scan.
 * @param {string} scanId
 * @param {'spdx'|'cyclonedx-json'|'cyclonedx-xml'} format
 */
export async function downloadSBOM(scanId, format) {
  const endpoint =
    format === 'spdx'
      ? `/scans/${scanId}/sbom/spdx`
      : `/scans/${scanId}/sbom/cyclonedx${format === 'cyclonedx-xml' ? '?format=xml' : ''}`;
  return api.get(endpoint, { responseType: 'blob' });
}

/**
 * Get license compliance report for a scan.
 * @param {string} scanId
 */
export async function getScanLicenses(scanId) {
  return api.get(`/scans/${scanId}/licenses`);
}

export default api;
