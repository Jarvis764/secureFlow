/**
 * @fileoverview Organisation Dashboard page for SecureFlow.
 *
 * Displays aggregate metrics across all scans for the current organisation:
 *  - Total scans, total vulnerabilities, average risk score
 *  - Risk trend line chart (last 10 scans)
 *  - Project cards with last-scan date, risk-score badge, and vuln count
 *
 * Role-based UI:
 *  - admin     : sees Settings link and full project list
 *  - developer : sees scan controls on project cards
 *  - viewer    : read-only — no New Scan button
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import MetricCard from '../components/MetricCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useAuth } from '../context/AuthContext';
import { getScans } from '../services/api';
import { formatDate } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sum all severity counts from a vulnerabilityCount subdocument.
 * Falls back to summing individual fields when `total` is absent.
 *
 * @param {Object} vc - The vulnerabilityCount subdocument from a Scan.
 * @returns {number}
 */
function sumVulns(vc) {
  if (!vc) return 0;
  return vc.total ?? ((vc.critical ?? 0) + (vc.high ?? 0) + (vc.medium ?? 0) + (vc.low ?? 0));
}

// ---------------------------------------------------------------------------
// Page layout constants
// ---------------------------------------------------------------------------

const PAGE_STYLE = {
  minHeight: 'calc(100vh - 64px)',
  marginTop: '64px',
  padding: '2rem',
  maxWidth: '1280px',
  margin: '64px auto 0',
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

// ---------------------------------------------------------------------------
// Risk score badge helper
// ---------------------------------------------------------------------------

/**
 * Returns colour and label for a 0-100 risk score.
 * @param {number} score
 * @returns {{ color: string, label: string }}
 */
function riskBadge(score) {
  if (score >= 75) return { color: 'var(--severity-critical)', label: 'Critical' };
  if (score >= 50) return { color: 'var(--severity-high)',     label: 'High'     };
  if (score >= 25) return { color: 'var(--severity-medium)',   label: 'Medium'   };
  return                  { color: 'var(--severity-low)',      label: 'Low'      };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrgDashboardPage() {
  const { user, org }             = useAuth();
  const navigate                  = useNavigate();
  const [scans, setScans]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const isAdmin     = user?.role === 'admin';
  const canScan     = user?.role === 'admin' || user?.role === 'developer';

  // Fetch the last 50 scans for aggregate metrics
  useEffect(() => {
    async function load() {
      try {
        const res = await getScans(1, 50);
        setScans(res.data?.scans ?? []);
      } catch {
        setError('Failed to load organisation data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ---------------------------------------------------------------------------
  // Derived metrics
  // ---------------------------------------------------------------------------
  const totalScans = scans.length;

  const totalVulns = scans.reduce((sum, s) => sum + sumVulns(s.vulnerabilityCount), 0);

  const avgRisk = totalScans
    ? Math.round(scans.reduce((sum, s) => sum + (s.riskScore ?? 0), 0) / totalScans)
    : 0;

  // Risk trend: last 10 scans in chronological order
  const trendData = scans
    .slice(0, 10)
    .reverse()
    .map((s, i) => ({
      name:  `Scan ${i + 1}`,
      score: s.riskScore ?? 0,
    }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={PAGE_STYLE}>

      {/* ── Header ── */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="show"
        style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}
      >
        <div>
          <h1 style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700 }}>
            {org?.name ?? 'Organisation'} Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.3rem', fontSize: '0.9rem' }}>
            {org?.plan ? (
              <span style={{
                display: 'inline-block',
                padding: '0.15rem 0.55rem',
                background: 'rgba(0,240,255,0.1)',
                border: '1px solid var(--accent-cyan)',
                borderRadius: '4px',
                color: 'var(--accent-cyan)',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginRight: '0.5rem',
              }}>
                {org.plan}
              </span>
            ) : null}
            Aggregate metrics for all projects
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {isAdmin && (
            <button
              className="btn-secondary"
              onClick={() => navigate('/history')}
              style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
            >
              ⚙ Settings
            </button>
          )}
          {canScan && (
            <button
              className="btn-primary"
              onClick={() => navigate('/scan')}
              style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
            >
              + New Scan
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Loading / Error ── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <LoadingSkeleton variant="card" count={3} />
        </div>
      ) : error ? (
        <div className="glass-card" style={{ color: 'var(--severity-critical)', padding: '1.5rem' }}>
          {error}
        </div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show">

          {/* ── Aggregate Metric Cards ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}>
            <motion.div variants={itemVariants}>
              <MetricCard
                title="Total Projects"
                value={totalScans}
                subtitle="Scans run in this organisation"
                icon="📁"
                variant="default"
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <MetricCard
                title="Total Vulnerabilities"
                value={totalVulns}
                subtitle="Across all scans"
                icon="⚠️"
                variant={totalVulns > 0 ? 'warning' : 'success'}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <MetricCard
                title="Average Risk Score"
                value={avgRisk}
                subtitle="0 = safe · 100 = critical"
                icon="📊"
                variant={avgRisk >= 75 ? 'danger' : avgRisk >= 50 ? 'warning' : 'success'}
              />
            </motion.div>
          </div>

          {/* ── Risk Trend Chart ── */}
          {trendData.length > 1 && (
            <motion.div variants={itemVariants} className="glass-card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
                Risk Score Trend (last {trendData.length} scans)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                    }}
                    formatter={(val) => [`${val}`, 'Risk Score']}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--accent-cyan)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--accent-cyan)', r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* ── Project Cards ── */}
          {scans.length === 0 ? (
            <motion.div
              variants={itemVariants}
              className="glass-card"
              style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '480px', margin: '2rem auto' }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
              <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No projects yet</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                Run your first scan to populate the organisation dashboard.
              </p>
              {canScan && (
                <button className="btn-primary" onClick={() => navigate('/scan')}>
                  Start First Scan →
                </button>
              )}
            </motion.div>
          ) : (
            <>
              <motion.div variants={itemVariants}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                  Recent Projects
                </h3>
              </motion.div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1rem',
              }}>
                {scans.map((scan) => {
                  const vc      = scan.vulnerabilityCount ?? {};
                  const vulns   = sumVulns(vc);
                  const badge   = riskBadge(scan.riskScore ?? 0);

                  return (
                    <motion.div
                      key={scan._id}
                      variants={itemVariants}
                      className="glass-card"
                      style={{ cursor: 'pointer', transition: 'border-color 0.2s' }}
                      onClick={() => navigate(`/scan/${scan._id}`)}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,240,255,0.35)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                    >
                      {/* Card header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontSize: '0.92rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {scan.projectName ?? 'Unnamed'}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                            {scan.source === 'github' ? '🐙 GitHub' : '📁 Upload'}
                          </div>
                        </div>

                        {/* Risk badge */}
                        <span style={{
                          padding: '0.2rem 0.6rem',
                          background: `${badge.color}22`,
                          border: `1px solid ${badge.color}`,
                          borderRadius: '4px',
                          color: badge.color,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          marginLeft: '0.5rem',
                        }}>
                          {scan.riskScore ?? 0} / 100
                        </span>
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        <span>📦 {scan.totalDependencies ?? 0} deps</span>
                        <span style={{ color: vulns > 0 ? 'var(--severity-high)' : 'var(--severity-low)' }}>
                          ⚠️ {vulns} vulns
                        </span>
                      </div>

                      {/* Date */}
                      <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Last scanned: {formatDate(scan.createdAt)}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
