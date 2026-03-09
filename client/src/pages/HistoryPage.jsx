import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getScans, deleteScan } from '../services/api';
import { formatDate } from '../utils/formatters';

const PAGE_STYLE = {
  minHeight: 'calc(100vh - 64px)',
  marginTop: '64px',
  padding: '2rem',
  maxWidth: '1280px',
  margin: '64px auto 0',
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'risk-high', label: 'Risk: High → Low' },
  { value: 'risk-low', label: 'Risk: Low → High' },
];

const PAGE_LIMIT = 10;

function relativeDate(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(dateStr);
}

function riskColor(score) {
  if (score >= 75) return { bg: 'rgba(239,68,68,0.15)', color: 'var(--severity-critical)', border: 'var(--severity-critical)' };
  if (score >= 50) return { bg: 'rgba(249,115,22,0.15)', color: 'var(--severity-high)', border: 'var(--severity-high)' };
  if (score >= 25) return { bg: 'rgba(234,179,8,0.15)', color: 'var(--severity-medium)', border: 'var(--severity-medium)' };
  return { bg: 'rgba(34,197,94,0.15)', color: 'var(--severity-low)', border: 'var(--severity-low)' };
}

function VulnBadges({ vc = {} }) {
  const items = [
    { key: 'critical', label: 'C', cls: 'badge-critical' },
    { key: 'high', label: 'H', cls: 'badge-high' },
    { key: 'medium', label: 'M', cls: 'badge-medium' },
    { key: 'low', label: 'L', cls: 'badge-low' },
  ];
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {items.map(({ key, label, cls }) =>
        (vc[key] ?? 0) > 0 ? (
          <span key={key} className={cls} style={{ padding: '0.1rem 0.45rem', fontSize: '0.7rem' }}>
            {label}: {vc[key]}
          </span>
        ) : null
      )}
      {Object.values(vc).every((v) => !v) && (
        <span style={{ color: 'var(--severity-low)', fontSize: '0.78rem' }}>None</span>
      )}
    </div>
  );
}

const rowVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (i) => ({ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.055, ease: 'easeOut' } }),
};

export default function HistoryPage() {
  const navigate = useNavigate();

  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState('newest');
  const [deleting, setDeleting] = useState(null); // scanId being deleted

  const load = useCallback(async (pageNum, sortKey) => {
    setLoading(true);
    setError('');
    try {
      const res = await getScans(pageNum, PAGE_LIMIT);
      let list = res.data?.scans ?? [];
      const pagination = res.data?.pagination ?? {};

      if (sortKey === 'risk-high') {
        list = [...list].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
      } else if (sortKey === 'risk-low') {
        list = [...list].sort((a, b) => (a.riskScore ?? 0) - (b.riskScore ?? 0));
      }

      setScans(list);
      setTotalPages(pagination.pages ?? 1);
    } catch {
      setError('Failed to load scan history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, sort);
  }, [load, page, sort]);

  function handleSortChange(e) {
    setSort(e.target.value);
    setPage(1);
  }

  async function handleDelete(e, scanId, projectName) {
    e.stopPropagation();
    if (!window.confirm(`Delete scan "${projectName}"? This cannot be undone.`)) return;
    setDeleting(scanId);
    try {
      await deleteScan(scanId);
      // Refresh the list
      load(page, sort);
    } catch {
      setError('Failed to delete scan.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div style={PAGE_STYLE}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}
      >
        <div>
          <h1 style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700 }}>
            Scan History
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.3rem', fontSize: '0.9rem' }}>
            View and manage past vulnerability scans.
          </p>
        </div>

        {/* Sort selector */}
        <select
          value={sort}
          onChange={handleSortChange}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '0.45rem 0.9rem',
            fontSize: '0.85rem',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} style={{ background: 'var(--bg-secondary)' }}>
              {o.label}
            </option>
          ))}
        </select>
      </motion.div>

      {/* Content */}
      {loading ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>⏳</div>
          Loading scan history…
        </div>
      ) : error ? (
        <div className="glass-card" style={{ color: 'var(--severity-critical)', padding: '2rem', textAlign: 'center' }}>
          ⚠️ {error}
        </div>
      ) : scans.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="glass-card"
          style={{ textAlign: 'center', padding: '4rem 2rem', maxWidth: '480px', margin: '4rem auto' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
          <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No scans yet</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Run your first vulnerability scan to see it here.
          </p>
          <motion.button
            className="btn-primary"
            onClick={() => navigate('/scan')}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Start First Scan →
          </motion.button>
        </motion.div>
      ) : (
        <>
          {/* Table */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="history-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Project', 'Risk Score', 'Vulnerabilities', 'Date', 'Actions'].map((h) => (
                      <th key={h} style={{
                        padding: '0.85rem 1.25rem',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="wait">
                    {scans.map((scan, i) => {
                      const risk = riskColor(scan.riskScore ?? 0);
                      const icon = scan.source === 'github' ? '🐙' : '📦';
                      return (
                        <motion.tr
                          key={scan._id}
                          custom={i}
                          variants={rowVariants}
                          initial="hidden"
                          animate="show"
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            cursor: 'pointer',
                            transition: 'background 0.18s ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,240,255,0.04)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          onClick={() => navigate(`/scan/${scan._id}`)}
                        >
                          {/* Project name */}
                          <td data-label="Project" style={{ padding: '0.85rem 1.25rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                            <span style={{ marginRight: '0.4rem' }}>{icon}</span>
                            {scan.projectName ?? 'Unknown'}
                          </td>

                          {/* Risk score badge */}
                          <td data-label="Risk Score" style={{ padding: '0.85rem 1.25rem' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.65rem',
                              background: risk.bg,
                              color: risk.color,
                              border: `1px solid ${risk.border}`,
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.82rem',
                            }}>
                              {scan.riskScore ?? 0}
                            </span>
                          </td>

                          {/* Vulnerability mini badges */}
                          <td data-label="Vulnerabilities" style={{ padding: '0.85rem 1.25rem' }}>
                            <VulnBadges vc={scan.vulnerabilityCount ?? {}} />
                          </td>

                          {/* Date */}
                          <td data-label="Date" style={{ padding: '0.85rem 1.25rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {relativeDate(scan.createdAt)}
                          </td>

                          {/* Actions */}
                          <td data-label="Actions" style={{ padding: '0.85rem 1.25rem' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <motion.button
                                className="btn-primary"
                                onClick={(e) => { e.stopPropagation(); navigate(`/scan/${scan._id}`); }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{ fontSize: '0.78rem', padding: '0.3rem 0.85rem' }}
                              >
                                View →
                              </motion.button>
                              <motion.button
                                onClick={(e) => handleDelete(e, scan._id, scan.projectName ?? 'Unknown')}
                                disabled={deleting === scan._id}
                                whileHover={{ scale: deleting === scan._id ? 1 : 1.1 }}
                                whileTap={{ scale: deleting === scan._id ? 1 : 0.9 }}
                                title="Delete scan"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  borderRadius: '6px',
                                  color: '#ef4444',
                                  padding: '0.3rem 0.6rem',
                                  cursor: deleting === scan._id ? 'wait' : 'pointer',
                                  fontSize: '0.78rem',
                                  opacity: deleting === scan._id ? 0.5 : 1,
                                  transition: 'all 0.2s',
                                }}
                              >
                                {deleting === scan._id ? '⏳' : '🗑️'}
                              </motion.button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '1rem',
              marginTop: '1.5rem',
            }}>
              <motion.button
                className="btn-secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                whileHover={{ scale: page === 1 ? 1 : 1.05 }}
                whileTap={{ scale: page === 1 ? 1 : 0.95 }}
                style={{ fontSize: '0.82rem', opacity: page === 1 ? 0.45 : 1, cursor: page === 1 ? 'default' : 'pointer' }}
              >
                ← Previous
              </motion.button>

              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Page <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> of{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{totalPages}</strong>
              </span>

              <motion.button
                className="btn-secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                whileHover={{ scale: page === totalPages ? 1 : 1.05 }}
                whileTap={{ scale: page === totalPages ? 1 : 0.95 }}
                style={{ fontSize: '0.82rem', opacity: page === totalPages ? 0.45 : 1, cursor: page === totalPages ? 'default' : 'pointer' }}
              >
                Next →
              </motion.button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
