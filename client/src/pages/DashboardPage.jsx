import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import MetricCard from '../components/MetricCard';
import RiskGauge from '../components/RiskGauge';
import SeverityDonut from '../components/SeverityDonut';
import CvssLegend from '../components/CvssLegend';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { getScans, getScanById } from '../services/api';
import { formatDate } from '../utils/formatters';

const PAGE_STYLE = {
  minHeight: 'calc(100vh - 64px)',
  marginTop: '64px',
  padding: '2rem',
  maxWidth: '1400px',
  margin: '64px auto 0',
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'easeOut' } },
};

/* ── Expandable panel animation ────────────────────────────── */
const panelVariants = {
  hidden: { opacity: 0, height: 0, marginTop: 0 },
  show: {
    opacity: 1, height: 'auto', marginTop: '0.5rem',
    transition: { duration: 0.28, ease: 'easeOut' }
  },
  exit: {
    opacity: 0, height: 0, marginTop: 0,
    transition: { duration: 0.2 }
  },
};

/* ── Shared panel style ─────────────────────────────────────── */
const PANEL_STYLE = {
  padding: '0.75rem 1rem',
  background: 'rgba(0, 212, 255, 0.04)',
  border: '1px solid rgba(0, 212, 255, 0.12)',
  borderRadius: '8px',
  fontSize: '0.78rem',
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vulnPackages, setVulnPackages] = useState([]);

  // Full scan detail data (dependencies)
  const [dependencies, setDependencies] = useState([]);

  /* Which card panel is expanded: null | 'deps' | 'vulns' | 'critical' | 'risk' */
  const [expandedCard, setExpandedCard] = useState(null);
  const toggle = (key) => setExpandedCard(prev => prev === key ? null : key);

  /* Dependency table search */
  const [depSearch, setDepSearch] = useState('');
  const [depTypeFilter, setDepTypeFilter] = useState('all'); // 'all' | 'direct' | 'transitive'
  const [depDefFilter, setDepDefFilter] = useState('all'); // 'all' | 'dep' | 'dev'

  useEffect(() => {
    async function load() {
      try {
        const res = await getScans(1, 1);
        const scans = res.data?.scans ?? [];
        const latestScan = scans[0] ?? null;
        setScan(latestScan);

        if (latestScan?._id) {
          try {
            const detailRes = await getScanById(latestScan._id);
            const deps = detailRes.data?.dependencies ?? [];
            const fullScan = detailRes.data?.scan ?? latestScan;

            // Merge full scan data (has totalDependencies, directDependencies, etc.)
            setScan(fullScan);
            setDependencies(deps);

            const vuln = deps
              .filter(d => d.vulnerabilities && d.vulnerabilities.length > 0)
              .map(d => ({
                name: d.name,
                version: d.version,
                severity: d.vulnerabilities[0]?.severity || 'medium',
                vulnCount: d.vulnerabilities.length,
              }))
              .sort((a, b) => {
                const order = { critical: 0, high: 1, medium: 2, low: 3 };
                return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
              });
            setVulnPackages(vuln);
          } catch { /* ignore */ }
        }
      } catch {
        setError('Failed to load scan data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const vc = scan?.vulnerabilityCount ?? {};
  const total = scan?.totalDependencies ?? 0;
  const vulnSum = (vc.critical ?? 0) + (vc.high ?? 0) + (vc.medium ?? 0) + (vc.low ?? 0);

  /* ── Severity color helper ───────────────────────────────── */
  const sevColor = (sev) => ({
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
  }[sev] || '#94a3b8');

  /* ── Filtered dependency table ───────────────────────────── */
  const filteredDeps = useMemo(() => {
    let list = [...dependencies];

    // Type filter
    if (depTypeFilter === 'direct') list = list.filter(d => d.depth === 0);
    else if (depTypeFilter === 'transitive') list = list.filter(d => d.depth > 0);

    // Definition filter  
    if (depDefFilter === 'dep') list = list.filter(d => !d.isDevDependency);
    else if (depDefFilter === 'dev') list = list.filter(d => d.isDevDependency);

    // Search
    if (depSearch.trim()) {
      const q = depSearch.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.version.toLowerCase().includes(q) ||
        (d.parent && d.parent.toLowerCase().includes(q))
      );
    }

    return list;
  }, [dependencies, depTypeFilter, depDefFilter, depSearch]);

  const riskBadgeColor = (score) => {
    if (score >= 75) return '#ef4444';
    if (score >= 50) return '#f97316';
    if (score >= 25) return '#eab308';
    return '#22c55e';
  };

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
          Overview of your latest dependency vulnerability scan. Click any card for details.
        </p>
      </motion.div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <LoadingSkeleton variant="card" count={3} />
          <LoadingSkeleton variant="gauge" count={1} />
        </div>
      ) : error ? (
        <div className="glass-card" style={{ color: 'var(--severity-critical)', padding: '1.5rem' }}>{error}</div>
      ) : !scan ? (
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

          {/* ════════════════════════════════════════════════════════
              METRIC CARDS ROW — clickable with expand panels
              ════════════════════════════════════════════════════════ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
            alignItems: 'start',
          }}>

            {/* ── 1) Total Dependencies ─────────────────────────── */}
            <motion.div variants={itemVariants}>
              <div onClick={() => toggle('deps')} style={{ cursor: 'pointer' }}>
                <MetricCard
                  title="Total Dependencies"
                  value={total}
                  subtitle={`${scan.directDependencies ?? 0} direct · ${scan.transitiveDependencies ?? 0} transitive`}
                  variant="default"
                  icon="📦"
                  delay={0}
                />
              </div>
              <AnimatePresence>
                {expandedCard === 'deps' && (
                  <motion.div variants={panelVariants} initial="hidden" animate="show" exit="exit" style={{ ...PANEL_STYLE, maxHeight: '520px', overflowY: 'auto' }}>
                    {/* Header with counts */}
                    <p style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      📦 Dependency File List ({filteredDeps.length} of {dependencies.length})
                    </p>

                    {/* Type summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', margin: '0.4rem 0' }}>
                      <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,212,255,0.06)', borderRadius: '6px', border: '1px solid rgba(0,212,255,0.1)' }}>
                        <strong style={{ color: '#00d4ff' }}>{scan.directDependencies ?? 0} Direct</strong>
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem' }}>Packages explicitly installed (in package.json)</p>
                      </div>
                      <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(249,115,22,0.06)', borderRadius: '6px', border: '1px solid rgba(249,115,22,0.1)' }}>
                        <strong style={{ color: '#f97316' }}>{scan.transitiveDependencies ?? 0} Transitive</strong>
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem' }}>Sub-dependencies your packages rely on</p>
                      </div>
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
                      <input
                        type="text"
                        placeholder="🔍 Search dependencies..."
                        value={depSearch}
                        onChange={(e) => setDepSearch(e.target.value)}
                        style={{
                          flex: 1, minWidth: '140px',
                          background: 'rgba(17,24,39,0.6)',
                          border: '1px solid rgba(0,212,255,0.15)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          padding: '0.3rem 0.5rem',
                          fontSize: '0.72rem',
                          outline: 'none',
                        }}
                      />
                      <select
                        value={depTypeFilter}
                        onChange={(e) => setDepTypeFilter(e.target.value)}
                        style={{
                          background: 'rgba(17,24,39,0.6)',
                          border: '1px solid rgba(0,212,255,0.15)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          padding: '0.3rem 0.5rem',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="all">All Types</option>
                        <option value="direct">Direct Only</option>
                        <option value="transitive">Transitive Only</option>
                      </select>
                      <select
                        value={depDefFilter}
                        onChange={(e) => setDepDefFilter(e.target.value)}
                        style={{
                          background: 'rgba(17,24,39,0.6)',
                          border: '1px solid rgba(0,212,255,0.15)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          padding: '0.3rem 0.5rem',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="all">All Definitions</option>
                        <option value="dep">dependencies</option>
                        <option value="dev">devDependencies</option>
                      </select>
                    </div>

                    {/* Dependency table */}
                    {filteredDeps.length === 0 ? (
                      <p style={{ margin: '0.5rem 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No dependencies match the current filters.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(0,212,255,0.12)' }}>
                              {['Package', 'Version', 'Type', 'Definition', 'Parent', 'Risk'].map(h => (
                                <th key={h} style={{
                                  padding: '0.35rem 0.4rem',
                                  textAlign: 'left',
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  color: 'var(--text-secondary)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDeps.slice(0, 100).map((d, i) => (
                              <tr key={`${d.name}-${d.version}-${i}`} style={{
                                borderBottom: '1px solid rgba(0,212,255,0.05)',
                                transition: 'background 0.15s',
                              }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.04)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <td style={{ padding: '0.3rem 0.4rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {d.name}
                                </td>
                                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--text-secondary)' }}>
                                  {d.version}
                                </td>
                                <td style={{ padding: '0.3rem 0.4rem' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '4px',
                                    fontSize: '0.66rem',
                                    fontWeight: 600,
                                    background: d.depth === 0 ? 'rgba(0,212,255,0.12)' : 'rgba(249,115,22,0.12)',
                                    color: d.depth === 0 ? '#00d4ff' : '#f97316',
                                    border: `1px solid ${d.depth === 0 ? 'rgba(0,212,255,0.25)' : 'rgba(249,115,22,0.25)'}`,
                                  }}>
                                    {d.depth === 0 ? 'Direct' : `Transitive (depth ${d.depth})`}
                                  </span>
                                </td>
                                <td style={{ padding: '0.3rem 0.4rem' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '4px',
                                    fontSize: '0.66rem',
                                    fontWeight: 600,
                                    background: d.isDevDependency ? 'rgba(168,85,247,0.12)' : 'rgba(34,197,94,0.12)',
                                    color: d.isDevDependency ? '#a855f7' : '#22c55e',
                                    border: `1px solid ${d.isDevDependency ? 'rgba(168,85,247,0.25)' : 'rgba(34,197,94,0.25)'}`,
                                  }}>
                                    {d.isDevDependency ? 'devDependency' : 'dependency'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.3rem 0.4rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.68rem' }}>
                                  {d.parent || '—'}
                                </td>
                                <td style={{ padding: '0.3rem 0.4rem' }}>
                                  <span style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    color: riskBadgeColor(d.riskScore ?? 0),
                                  }}>
                                    {d.riskScore ?? 0}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {filteredDeps.length > 100 && (
                          <p style={{ margin: '0.3rem 0 0', fontSize: '0.68rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                            Showing first 100 of {filteredDeps.length} — <span onClick={() => navigate(`/scan/${scan._id}`)} style={{ color: '#00d4ff', cursor: 'pointer' }}>View all →</span>
                          </p>
                        )}
                      </div>
                    )}

                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.68rem', fontStyle: 'italic' }}>
                      Transitive dependencies are scanned because attackers can exploit vulnerabilities at any depth in the tree.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── 2) Vulnerabilities Found ──────────────────────── */}
            <motion.div variants={itemVariants}>
              <div onClick={() => toggle('vulns')} style={{ cursor: 'pointer' }}>
                <MetricCard
                  title="Vulnerabilities Found"
                  value={vulnSum}
                  subtitle="Click for affected packages ▾"
                  variant={vulnSum > 0 ? 'warning' : 'success'}
                  icon="⚠️"
                  delay={0.09}
                />
              </div>
              <AnimatePresence>
                {expandedCard === 'vulns' && (
                  <motion.div variants={panelVariants} initial="hidden" animate="show" exit="exit" style={PANEL_STYLE}>
                    <p style={{ margin: '0 0 0.4rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      🔓 Affected Packages
                    </p>
                    {vulnPackages.length === 0 ? (
                      <p style={{ margin: 0, color: '#22c55e' }}>✅ No vulnerabilities detected — all packages are safe!</p>
                    ) : (
                      <>
                        {vulnPackages.slice(0, 8).map((pkg, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.25rem 0',
                            borderBottom: i < Math.min(vulnPackages.length, 8) - 1
                              ? '1px solid rgba(0, 212, 255, 0.06)' : 'none',
                          }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: sevColor(pkg.severity), flexShrink: 0, boxShadow: `0 0 5px ${sevColor(pkg.severity)}55` }} />
                            <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {pkg.name}<span style={{ color: 'var(--text-secondary)' }}>@{pkg.version}</span>
                            </span>
                            <span style={{ color: sevColor(pkg.severity), fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', flexShrink: 0 }}>
                              {pkg.severity}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.66rem', flexShrink: 0 }}>
                              ({pkg.vulnCount} {pkg.vulnCount === 1 ? 'vuln' : 'vulns'})
                            </span>
                          </div>
                        ))}
                        {vulnPackages.length > 8 && (
                          <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', fontStyle: 'italic' }}>
                            +{vulnPackages.length - 8} more — <span onClick={() => navigate(`/scan/${scan._id}`)} style={{ color: '#00d4ff', cursor: 'pointer' }}>View all →</span>
                          </p>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── 3) Critical Issues ────────────────────────────── */}
            <motion.div variants={itemVariants}>
              <div onClick={() => toggle('critical')} style={{ cursor: 'pointer' }}>
                <MetricCard
                  title="Critical Issues"
                  value={vc.critical ?? 0}
                  subtitle="Click for details ▾"
                  variant={(vc.critical ?? 0) > 0 ? 'danger' : 'success'}
                  icon="🔴"
                  delay={0.18}
                />
              </div>
              <AnimatePresence>
                {expandedCard === 'critical' && (
                  <motion.div variants={panelVariants} initial="hidden" animate="show" exit="exit" style={PANEL_STYLE}>
                    <p style={{ margin: '0 0 0.4rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      🚨 Critical Vulnerability Details
                    </p>
                    {(vc.critical ?? 0) === 0 ? (
                      <p style={{ margin: 0, color: '#22c55e' }}>✅ No critical vulnerabilities — your project is in good shape!</p>
                    ) : (
                      <>
                        <p style={{ margin: '0 0 0.4rem' }}>
                          <strong style={{ color: '#ef4444' }}>{vc.critical} critical {vc.critical === 1 ? 'vulnerability' : 'vulnerabilities'}</strong> with
                          a CVSS score of <strong>9.0 – 10.0</strong> found. These could allow:
                        </p>
                        <ul style={{ margin: '0.2rem 0 0.4rem 1.2rem', fontSize: '0.74rem', paddingLeft: 0 }}>
                          <li>🔓 Remote code execution (attacker runs commands on your server)</li>
                          <li>📊 Full system compromise (complete takeover)</li>
                          <li>🗃️ Sensitive data breach (user data, API keys leaked)</li>
                        </ul>
                        {vulnPackages.filter(p => p.severity === 'critical').length > 0 && (
                          <div style={{ marginTop: '0.3rem' }}>
                            <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.74rem', color: '#ef4444' }}>Affected critical packages:</p>
                            {vulnPackages.filter(p => p.severity === 'critical').map((pkg, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0' }}>
                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)' }}>
                                  {pkg.name}@{pkg.version}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          className="btn-primary"
                          onClick={() => navigate(`/scan/${scan._id}`)}
                          style={{ marginTop: '0.5rem', fontSize: '0.74rem', padding: '0.3rem 0.8rem' }}
                        >
                          Fix Now →
                        </button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── 4) Risk Score with expandable explanation ──────── */}
            <motion.div variants={itemVariants}>
              <div
                onClick={() => toggle('risk')}
                className="glass-card"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}
              >
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem',
                }}>
                  Risk Score &nbsp;▾
                </span>
                <RiskGauge score={scan.riskScore ?? 0} size={180} />
              </div>
              <AnimatePresence>
                {expandedCard === 'risk' && (
                  <motion.div variants={panelVariants} initial="hidden" animate="show" exit="exit" style={PANEL_STYLE}>
                    <p style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      📐 How is Risk Score Calculated?
                    </p>
                    <p style={{ margin: '0 0 0.4rem' }}>
                      The risk score (0 – 100) rates your project's overall security exposure.
                      It's calculated using a <strong>weighted formula</strong> across 4 factors:
                    </p>

                    <div style={{
                      padding: '0.5rem 0.7rem',
                      background: 'rgba(17, 24, 39, 0.5)',
                      border: '1px solid rgba(0, 212, 255, 0.1)',
                      borderRadius: '6px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      margin: '0.4rem 0',
                    }}>
                      <p style={{ margin: '0 0 0.3rem', color: '#00d4ff', fontWeight: 600 }}>score = </p>
                      <p style={{ margin: '0 0 0.15rem', paddingLeft: '1rem' }}><span style={{ color: '#ef4444' }}>CVSS Score</span> × <strong>40%</strong> &nbsp;← Worst vulnerability severity</p>
                      <p style={{ margin: '0 0 0.15rem', paddingLeft: '1rem' }}>+ <span style={{ color: '#f97316' }}>Depth Penalty</span> × <strong>20%</strong> &nbsp;← Closer to root = higher risk</p>
                      <p style={{ margin: '0 0 0.15rem', paddingLeft: '1rem' }}>+ <span style={{ color: '#eab308' }}>Production</span> × <strong>25%</strong> &nbsp;← Prod deps weighted 3× more than dev</p>
                      <p style={{ margin: '0', paddingLeft: '1rem' }}>+ <span style={{ color: '#22c55e' }}>Vuln Count</span> × <strong>15%</strong> &nbsp;← Number of known vulnerabilities</p>
                    </div>

                    <p style={{ margin: '0.4rem 0 0.3rem', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.76rem' }}>
                      Score Ranges:
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.35rem' }}>
                      {[
                        { range: '0 – 25', label: 'Low Risk', color: '#22c55e', desc: 'Safe, minimal exposure' },
                        { range: '26 – 50', label: 'Moderate Risk', color: '#eab308', desc: 'Some concerns, review deps' },
                        { range: '51 – 75', label: 'High Risk', color: '#f97316', desc: 'Significant exposure, act soon' },
                        { range: '76 – 100', label: 'Critical Risk', color: '#ef4444', desc: 'Severe, immediate action needed' },
                      ].map(({ range, label, color, desc }) => (
                        <div key={range} style={{
                          padding: '0.35rem 0.5rem',
                          background: `${color}0D`,
                          border: `1px solid ${color}22`,
                          borderRadius: '6px',
                        }}>
                          <span style={{ color, fontWeight: 700, fontSize: '0.72rem' }}>{range}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}> — {label}</span>
                          <p style={{ margin: '0.1rem 0 0', fontSize: '0.66rem' }}>{desc}</p>
                        </div>
                      ))}
                    </div>

                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', fontStyle: 'italic' }}>
                      Your current score of <strong style={{ color: (scan.riskScore ?? 0) >= 75 ? '#ef4444' : (scan.riskScore ?? 0) >= 50 ? '#f97316' : '#eab308' }}>{scan.riskScore ?? 0}</strong> is
                      based on the top-10 riskiest dependencies (top 3 at 60% weight, next 7 at 40%).
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* ════════════════════════════════════════════════════════
              SEVERITY BAR + ALERTS
              ════════════════════════════════════════════════════════ */}
          {vulnSum > 0 && (
            <motion.div variants={itemVariants} style={{ marginBottom: '1.5rem' }}>
              <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  Vulnerability Severity Distribution
                </h3>
                <div style={{
                  display: 'flex', borderRadius: '6px', overflow: 'hidden',
                  height: '28px', background: 'rgba(17, 24, 39, 0.6)',
                }}>
                  {[
                    { key: 'critical', label: 'Critical', count: vc.critical ?? 0, color: '#ef4444' },
                    { key: 'high', label: 'High', count: vc.high ?? 0, color: '#f97316' },
                    { key: 'medium', label: 'Medium', count: vc.medium ?? 0, color: '#eab308' },
                    { key: 'low', label: 'Low', count: vc.low ?? 0, color: '#22c55e' },
                  ].filter(s => s.count > 0).map(({ key, label, count, color }) => (
                    <div key={key} style={{
                      flex: count, background: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: count > 0 ? '36px' : 0, transition: 'flex 0.4s ease',
                    }}>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700,
                        color: key === 'medium' || key === 'low' ? '#0a0e1a' : '#fff',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
                      }}>
                        {count} {label}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginTop: '0.4rem', fontSize: '0.68rem',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <span style={{ color: '#ef4444' }}>🔴 Critical 9.0–10.0</span>
                  <span style={{ color: '#f97316' }}>🟠 High 7.0–8.9</span>
                  <span style={{ color: '#eab308' }}>🟡 Medium 4.0–6.9</span>
                  <span style={{ color: '#22c55e' }}>🟢 Low 0.1–3.9</span>
                </div>
              </div>

              {/* Critical alert banner */}
              {(vc.critical ?? 0) > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
                  style={{
                    marginTop: '0.75rem', padding: '1rem 1.25rem',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderLeft: '4px solid #ef4444', borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#ef4444' }}>
                        🚨 {vc.critical} Critical {vc.critical === 1 ? 'Vulnerability' : 'Vulnerabilities'} Detected
                      </p>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        CVSS 9.0+ — Could allow remote code execution, full system compromise, or
                        sensitive data breach. <strong style={{ color: '#ef4444' }}>Immediate action required.</strong>
                      </p>
                    </div>
                    <button className="btn-primary" onClick={() => navigate(`/scan/${scan._id}`)}
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.9rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      View Details →
                    </button>
                  </div>
                </motion.div>
              )}

              {/* High severity card */}
              {(vc.high ?? 0) > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
                  style={{
                    marginTop: '0.5rem', padding: '0.75rem 1.25rem',
                    background: 'rgba(249, 115, 22, 0.06)',
                    border: '1px solid rgba(249, 115, 22, 0.25)',
                    borderLeft: '4px solid #f97316', borderRadius: '8px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: '0.75rem', flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#f97316' }}>
                      ⚠️ {vc.high} High Severity {vc.high === 1 ? 'Issue' : 'Issues'}
                    </p>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      CVSS 7.0 – 8.9 — Serious damage possible, should be addressed soon.
                    </p>
                  </div>
                  <button className="btn-secondary" onClick={() => navigate(`/scan/${scan._id}`)}
                    style={{ fontSize: '0.74rem', padding: '0.3rem 0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Review →
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════
              SEVERITY DONUT + FULL LATEST SCAN DETAILS
              ════════════════════════════════════════════════════════ */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1.6fr',
            gap: '1rem', marginBottom: '1.5rem',
          }}>
            <motion.div variants={itemVariants} className="glass-card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                Severity Breakdown
              </h3>
              <SeverityDonut data={{
                critical: vc.critical ?? 0, high: vc.high ?? 0,
                medium: vc.medium ?? 0, low: vc.low ?? 0,
              }} />
            </motion.div>

            <motion.div variants={itemVariants} className="glass-card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                Latest Scan Details
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {[
                    { label: 'Project', value: scan.projectName ?? 'Unknown' },
                    { label: 'Source', value: scan.source === 'github' ? '🐙 GitHub' : '📁 File Upload' },
                    { label: 'Scanned', value: formatDate(scan.createdAt) },
                    { label: 'Status', value: <span style={{ color: 'var(--severity-low)', fontWeight: 600 }}>{(scan.status ?? 'complete').toUpperCase()}</span> },
                    { label: 'Risk Score', value: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{scan.riskScore ?? 0}</span> },
                    { label: 'Total Dependencies', value: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{scan.totalDependencies ?? 0}</span> },
                    { label: 'Direct Dependencies', value: <span style={{ color: '#00d4ff', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{scan.directDependencies ?? 0}</span> },
                    { label: 'Transitive Dependencies', value: <span style={{ color: '#f97316', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{scan.transitiveDependencies ?? 0}</span> },
                    { label: 'Critical', value: <span style={{ color: '#ef4444', fontWeight: 700 }}>{vc.critical ?? 0}</span> },
                    { label: 'High', value: <span style={{ color: '#f97316', fontWeight: 700 }}>{vc.high ?? 0}</span> },
                    { label: 'Medium', value: <span style={{ color: '#eab308', fontWeight: 700 }}>{vc.medium ?? 0}</span> },
                    { label: 'Low', value: <span style={{ color: '#22c55e', fontWeight: 700 }}>{vc.low ?? 0}</span> },
                  ].map(({ label, value }) => (
                    <tr key={label} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem 0', color: 'var(--text-secondary)', width: '40%' }}>{label}</td>
                      <td style={{ padding: '0.5rem 0', color: 'var(--text-primary)' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scan.repoUrl && (
                <a href={scan.repoUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '0.75rem', color: 'var(--accent-cyan)', fontSize: '0.82rem' }}>
                  View repository →
                </a>
              )}
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn-primary" onClick={() => navigate(`/scan/${scan._id}`)}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 1rem' }}>
                  View Full Report →
                </button>
              </div>
            </motion.div>
          </div>


          {/* ── CVSS Info on Dashboard ───────────────────────────── */}
          <motion.div variants={itemVariants} className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <CvssLegend defaultExpanded={true} />
          </motion.div>

          {/* CTA */}
          <motion.div variants={itemVariants} style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
            <button className="btn-primary" onClick={() => navigate('/scan')}
              style={{ fontSize: '1rem', padding: '0.65rem 2rem' }}>
              + Start New Scan
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
