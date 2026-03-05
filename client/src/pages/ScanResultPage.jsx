import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getScanById } from '../services/api';
import MetricCard from '../components/MetricCard';
import RiskGauge from '../components/RiskGauge';
import SeverityDonut from '../components/SeverityDonut';
import DependencyGraph from '../components/DependencyGraph';
import VulnDetailPanel from '../components/VulnDetailPanel';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { formatDate } from '../utils/formatters';

const PAGE_STYLE = {
  minHeight: 'calc(100vh - 64px)',
  padding:   '2rem',
  maxWidth:  '1400px',
  margin:    '64px auto 0',
};

const containerVariants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'easeOut' } },
};

const SOURCE_LABELS = {
  github: '🐙 GitHub',
};
function getSourceLabel(source) {
  return SOURCE_LABELS[source] ?? '📁 File Upload';
}

export default function ScanResultPage() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const graphWrapRef = useRef(null);

  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphWidth,   setGraphWidth]   = useState(900);

  // ── Fetch scan ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await getScanById(id);
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load scan data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  // ── Responsive graph width ─────────────────────────────────────────────────
  useEffect(() => {
    if (!graphWrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setGraphWidth(Math.floor(w));
    });
    ro.observe(graphWrapRef.current);
    return () => ro.disconnect();
  }, []);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const { scan, dependencies, graphData } = data || {};
  const nodes = graphData?.nodes ?? [];
  const links = graphData?.links ?? [];
  const vc    = scan?.vulnerabilityCount ?? {};
  const vulnSum = (vc.critical ?? 0) + (vc.high ?? 0) + (vc.medium ?? 0) + (vc.low ?? 0);

  // Find full dependency object for selected node (for vulnerability details)
  const selectedDependency = selectedNode
    ? (dependencies ?? []).find(
        (d) => `${d.name}@${d.version}` === selectedNode.id,
      ) ?? null
    : null;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={PAGE_STYLE}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <LoadingSkeleton variant="card" count={4} />
        </div>
        <LoadingSkeleton variant="gauge" count={1} />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ ...PAGE_STYLE, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '4rem' }}>
        <div className="glass-card" style={{ color: 'var(--severity-critical)', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
          <p>{error}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/scan')}>← Back to Scan</button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={PAGE_STYLE}>
      <motion.div variants={containerVariants} initial="hidden" animate="show">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <motion.div variants={itemVariants} style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h1 style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700 }}>
                {scan?.projectName ?? 'Scan Results'}
              </h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
                Scanned {formatDate(scan?.createdAt)} · {getSourceLabel(scan?.source)}
              </p>
            </div>
            <button className="btn-primary" onClick={() => navigate('/scan')} style={{ fontSize: '0.85rem' }}>
              + New Scan
            </button>
          </div>
        </motion.div>

        {/* ── Metric cards ──────────────────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap:                 '1rem',
            marginBottom:        '1.5rem',
            alignItems:          'start',
          }}
        >
          <MetricCard
            title="Total Dependencies"
            value={scan?.totalDependencies ?? 0}
            subtitle={`${scan?.directDependencies ?? 0} direct · ${scan?.transitiveDependencies ?? 0} transitive`}
            variant="default"
            icon="📦"
          />
          <MetricCard
            title="Vulnerabilities"
            value={vulnSum}
            subtitle="Across all severity levels"
            variant={vulnSum > 0 ? 'warning' : 'success'}
            icon="⚠️"
          />
          <MetricCard
            title="Critical Issues"
            value={vc.critical ?? 0}
            subtitle="Require immediate attention"
            variant={(vc.critical ?? 0) > 0 ? 'danger' : 'success'}
            icon="🔴"
          />

          {/* Risk gauge */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem' }}>
            <span style={{
              fontSize:      '0.72rem',
              fontWeight:    600,
              color:         'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom:  '0.1rem',
            }}>
              Risk Score
            </span>
            <RiskGauge score={scan?.riskScore ?? 0} size={160} />
          </div>
        </motion.div>

        {/* ── Severity donut + scan meta ────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1.6fr',
            gap:                 '1rem',
            marginBottom:        '1.5rem',
          }}
        >
          <div className="glass-card">
            <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Severity Breakdown
            </h3>
            <SeverityDonut data={{
              critical: vc.critical ?? 0,
              high:     vc.high     ?? 0,
              medium:   vc.medium   ?? 0,
              low:      vc.low      ?? 0,
            }} />
          </div>

          <div className="glass-card">
            <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Scan Details
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <tbody>
                {[
                  { label: 'Project',     value: scan?.projectName ?? 'Unknown' },
                  { label: 'Source',      value: getSourceLabel(scan?.source) },
                  { label: 'Scanned',     value: formatDate(scan?.createdAt) },
                  { label: 'Status',      value: <span style={{ color: 'var(--severity-low)', fontWeight: 600 }}>{(scan?.status ?? 'complete').toUpperCase()}</span> },
                  { label: 'Risk Score',  value: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{scan?.riskScore ?? 0}</span> },
                ].map(({ label, value }) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0', color: 'var(--text-secondary)', width: '38%' }}>{label}</td>
                    <td style={{ padding: '0.5rem 0', color: 'var(--text-primary)' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scan?.repoUrl && (
              <a
                href={scan.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: '0.75rem', color: 'var(--accent-cyan)', fontSize: '0.82rem' }}
              >
                View repository →
              </a>
            )}
          </div>
        </motion.div>

        {/* ── Dependency graph ──────────────────────────────────────────── */}
        <motion.div variants={itemVariants}>
          <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
            {/* Graph header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Dependency Graph
                <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  {nodes.length} nodes · {links.length} edges
                </span>
              </h3>
              {selectedNode && (
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{
                    background:   'none',
                    border:       '1px solid rgba(0, 212, 255, 0.25)',
                    borderRadius: '6px',
                    color:        'var(--text-secondary)',
                    padding:      '0.25rem 0.65rem',
                    cursor:       'pointer',
                    fontSize:     '0.78rem',
                  }}
                >
                  Clear selection
                </button>
              )}
            </div>

            {/* Hint text */}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Click a node to inspect vulnerabilities · Scroll to zoom · Drag to pan · Drag nodes to rearrange
            </p>

            {/* Graph container (relative for the detail panel overlay) */}
            <div
              ref={graphWrapRef}
              style={{
                position:     'relative',
                width:        '100%',
                height:       '560px',
                borderRadius: '8px',
                overflow:     'hidden',
                background:   'rgba(0,0,0,0.2)',
                border:       '1px solid rgba(0, 212, 255, 0.06)',
              }}
            >
              {nodes.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                  No dependency graph data available.
                </div>
              ) : (
                <DependencyGraph
                  nodes={nodes}
                  links={links}
                  onNodeClick={handleNodeClick}
                  width={graphWidth}
                  height={560}
                />
              )}

              {/* Vulnerability detail panel (absolute overlay on the right) */}
              <VulnDetailPanel
                node={selectedNode}
                dependency={selectedDependency}
                onClose={() => setSelectedNode(null)}
              />
            </div>
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}
