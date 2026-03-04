/**
 * Formats a number with comma separators.
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function formatNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

/**
 * Formats a date string as "Mar 4, 2026 at 8:30 PM".
 * @param {string|Date|null} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const datePart = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} at ${timePart}`;
}

/**
 * Returns the CSS variable string for a severity level.
 * @param {string} severity
 * @returns {string}
 */
export function getSeverityColor(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical': return 'var(--severity-critical)';
    case 'high':     return 'var(--severity-high)';
    case 'medium':   return 'var(--severity-medium)';
    case 'low':      return 'var(--severity-low)';
    default:         return 'var(--text-secondary)';
  }
}

/**
 * Returns an emoji + label string for a severity level.
 * @param {string} severity
 * @returns {string}
 */
export function getSeverityEmoji(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical': return '🔴 CRITICAL';
    case 'high':     return '🟠 HIGH';
    case 'medium':   return '🟡 MEDIUM';
    case 'low':      return '🔵 LOW';
    default:         return (severity || '').toUpperCase();
  }
}

// Backward-compatible aliases
export function formatRiskScore(score) {
  return String(Math.round(score ?? 0));
}

export function severityColor(severity) {
  return getSeverityColor(severity);
}

export function truncate(str, len) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}
