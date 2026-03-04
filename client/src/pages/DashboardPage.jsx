import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import MetricCard from '../components/MetricCard';
import RiskGauge from '../components/RiskGauge';
import SeverityDonut from '../components/SeverityDonut';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { getScans } from '../services/api';
import { formatDate } from '../utils/formatters';

const PAGE_STYLE = {
  minHeight: 'calc(100vh - 64px)',
  marginTop: '64px',
  padding: '2rem',
  maxWidth: '1280px',
  margin: '64px auto 0',
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'easeOut' } },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [scan, setScan]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await getScans(1, 1);
        const scans = res.data?.scans ?? [];
        setScan(scans[0] ?? null);
      } catch {
        setError('Failed to load scan data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const vc      = scan?.vulnerabilityCount ?? {};
  const total   = scan?.totalDependencies    ?? 0;
  const vulnSum = (vc.critical ?? 0) + (vc.high ?? 0) + (vc.medium ?? 0) + (vc.low ?? 0);

  return (
    <div style={PAGE_STYLE}>
      {/* Header */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="show"
        style={{ marginBottom: '1.75rem' }}
      >
        <h1 style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700 }}>
          Security Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.3rem', fontSize: '0.9rem' }}>
          Overview of your latest dependency vulnerability scan.
        </p>
      </motion.div>

      {loading ? (
        /* Loading state */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <LoadingSkeleton variant="card" count={3} />
          <LoadingSkeleton variant="gauge" count={1} />
        </div>
      ) : error ? (
        <div className="glass-card" style={{ color: 'var(--severity-critical)', padding: '1.5rem' }}>{error}</div>
      ) : !scan ? (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="glass-card"
          style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '480px', margin: '4rem auto' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
          <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No scans yet</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Run your first vulnerability scan to see results here.
          </p>
          <button className="btn-primary" onClick={() => navigate('/scan')}>
            Start First Scan →
          </button>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show">
          {/* Metric cards row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
            alignItems: 'start',
          }}>
            <motion.div variants={itemVariants}>
              <MetricCard
                title="Total Dependencies"
                value={total}
                subtitle={`${scan.directDependencies ?? 0} direct · ${scan.transitiveDependencies ?? 0} transitive`}
                variant="default"
                icon="📦"
                delay={0}
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <MetricCard
                title="Vulnerabilities Found"
                value={vulnSum}
                subtitle="Across all severity levels"
                variant={vulnSum > 0 ? 'warning' : 'success'}
                icon="⚠️"
                delay={0.09}
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <MetricCard
                title="Critical Issues"
                value={vc.critical ?? 0}
                subtitle="Require immediate attention"
                variant={(vc.critical ?? 0) > 0 ? 'danger' : 'success'}
                icon="🔴"
                delay={0.18}
              />
            </motion.div>
            {/* Risk Gauge card */}
            <motion.div
              variants={itemVariants}
              className="glass-card"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem' }}
            >
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '0.25rem',
              }}>
                Risk Score
              </span>
              <RiskGauge score={scan.riskScore ?? 0} size={180} />
            </motion.div>
          </div>

          {/* Middle: donut + recent scans */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.6fr',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}>
            <motion.div variants={itemVariants} className="glass-card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                Severity Breakdown
              </h3>
              <SeverityDonut data={{
                critical: vc.critical ?? 0,
                high:     vc.high     ?? 0,
                medium:   vc.medium   ?? 0,
                low:      vc.low      ?? 0,
              }} />
            </motion.div>

            <motion.div variants={itemVariants} className="glass-card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                Latest Scan
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {[
                    { label: 'Project',   value: scan.projectName ?? 'Unknown' },
                    { label: 'Source',    value: scan.source === 'github' ? '🐙 GitHub' : '📁 File Upload' },
                    { label: 'Scanned',   value: formatDate(scan.createdAt) },
                    { label: 'Status',    value: <span style={{ color: 'var(--severity-low)', fontWeight: 600 }}>{(scan.status ?? 'complete').toUpperCase()}</span> },
                    { label: 'Risk Score', value: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{scan.riskScore ?? 0}</span> },
                  ].map(({ label, value }) => (
                    <tr key={label} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem 0', color: 'var(--text-secondary)', width: '40%' }}>{label}</td>
                      <td style={{ padding: '0.5rem 0', color: 'var(--text-primary)' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scan.repoUrl && (
                <a
                  href={scan.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '0.75rem', color: 'var(--accent-cyan)', fontSize: '0.82rem' }}
                >
                  View repository →
                </a>
              )}
            </motion.div>
          </div>

          {/* CTA */}
          <motion.div
            variants={itemVariants}
            style={{ textAlign: 'center', paddingTop: '0.5rem' }}
          >
            <button
              className="btn-primary"
              onClick={() => navigate('/scan')}
              style={{ fontSize: '1rem', padding: '0.65rem 2rem' }}
            >
              + Start New Scan
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
