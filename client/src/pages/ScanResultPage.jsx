import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { getScanById, downloadSBOM } from '../services/api';
import MetricCard from '../components/MetricCard';
import RiskGauge from '../components/RiskGauge';
import SeverityDonut from '../components/SeverityDonut';
import DependencyGraph from '../components/DependencyGraph';
import VulnDetailPanel from '../components/VulnDetailPanel';
import LoadingSkeleton from '../components/LoadingSkeleton';
import SbomPreviewPanel from '../components/SbomPreviewPanel';
import LicenseCompliancePanel from '../components/LicenseCompliancePanel';
import { formatDate } from '../utils/formatters';

const PAGE_STYLE = {
  minHeight: 'calc(100vh - 64px)',
  padding: '2rem',
  maxWidth: '1400px',
  margin: '64px auto 0',
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'easeOut' } },
};

const SOURCE_LABELS = {
  github: '🐙 GitHub',
};
function getSourceLabel(source) {
  return SOURCE_LABELS[source] ?? '📁 File Upload';
}

export default function ScanResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const graphWrapRef = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphWidth, setGraphWidth] = useState(900);
  const [exporting, setExporting] = useState(false);
  const [sbomDownloading, setSbomDownloading] = useState(null); // 'spdx' | 'cyclonedx-json' | 'cyclonedx-xml' | null
  const [activeModule, setActiveModule] = useState('All');

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
  const { scan, dependencies, graphData, licenseReport } = data || {};
  const nodes = graphData?.nodes ?? [];
  const links = graphData?.links ?? [];
  const vc = scan?.vulnerabilityCount ?? {};
  const vulnSum = (vc.critical ?? 0) + (vc.high ?? 0) + (vc.medium ?? 0) + (vc.low ?? 0);

  // ── PDF Export ────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (!scan || exporting) return;
    setExporting(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const ts = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const projectName = scan.projectName ?? 'Unknown';
      const dateStr = new Date().toISOString().slice(0, 10);

      // ── Page 1: Report ─────────────────────────────────────────────────
      // Header bar
      pdf.setFillColor(0, 240, 255);
      pdf.rect(0, 0, pw, 14, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(10, 14, 26);
      pdf.text('SecureFlow Security Report', margin, 9.5);

      // Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.setTextColor(0, 240, 255);
      pdf.text(projectName, margin, 30);

      // Meta row
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Scanned: ${formatDate(scan.createdAt)}`, margin, 38);
      pdf.text(`Source: ${scan.source === 'github' ? 'GitHub' : 'File Upload'}`, margin + 80, 38);

      // Risk score block
      const riskScore = scan.riskScore ?? 0;
      const riskColor = riskScore >= 75 ? [239, 68, 68] : riskScore >= 50 ? [249, 115, 22] : riskScore >= 25 ? [234, 179, 8] : [34, 197, 94];
      pdf.setFillColor(...riskColor, 25);
      pdf.roundedRect(margin, 45, 55, 22, 3, 3, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(24);
      pdf.setTextColor(...riskColor);
      pdf.text(String(riskScore), margin + 8, 61);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(148, 163, 184);
      pdf.text('RISK SCORE', margin + 8, 65);

      // Divider
      pdf.setDrawColor(0, 240, 255, 30);
      pdf.line(margin, 73, pw - margin, 73);

      // Vulnerability summary table
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(226, 232, 240);
      pdf.text('Vulnerability Summary', margin, 81);

      const vc = scan.vulnerabilityCount ?? {};
      const rows = [
        { label: 'Critical', count: vc.critical ?? 0, color: [239, 68, 68] },
        { label: 'High', count: vc.high ?? 0, color: [249, 115, 22] },
        { label: 'Medium', count: vc.medium ?? 0, color: [234, 179, 8] },
        { label: 'Low', count: vc.low ?? 0, color: [34, 197, 94] },
      ];
      const total = rows.reduce((s, r) => s + r.count, 0);

      let y = 88;
      rows.forEach(({ label, count, color }) => {
        // Row bg
        pdf.setFillColor(17, 24, 39);
        pdf.rect(margin, y, pw - margin * 2, 9, 'F');
        // Severity label
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...color);
        pdf.text(label, margin + 3, y + 6);
        // Count
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(226, 232, 240);
        pdf.text(String(count), pw - margin - 10, y + 6, { align: 'right' });
        // Bar
        const barW = pw - margin * 2 - 40;
        pdf.setFillColor(30, 41, 59);
        pdf.rect(margin + 30, y + 3, barW, 3, 'F');
        if (total > 0 && count > 0) {
          pdf.setFillColor(...color);
          pdf.rect(margin + 30, y + 3, barW * (count / total), 3, 'F');
        }
        y += 11;
      });

      // Total row
      y += 2;
      pdf.setDrawColor(0, 240, 255, 40);
      pdf.line(margin, y, pw - margin, y);
      y += 6;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(226, 232, 240);
      pdf.text('Total Vulnerabilities', margin + 3, y);
      pdf.text(String(total), pw - margin - 10, y, { align: 'right' });

      // Dependency counts
      y += 14;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Total Dependencies: ${scan.totalDependencies ?? 0}`, margin, y);
      pdf.text(`Direct: ${scan.directDependencies ?? 0}  ·  Transitive: ${scan.transitiveDependencies ?? 0}`, margin, y + 6);

      // Footer
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7.5);
      pdf.setTextColor(71, 85, 105);
      pdf.text(`Generated by SecureFlow · ${ts}`, margin, ph - 10);

      // ── Page 2: Dependency graph screenshot ───────────────────────────
      if (graphWrapRef.current) {
        const canvas = await html2canvas(graphWrapRef.current, {
          backgroundColor: '#0a0e1a',
          scale: 1.5,
          useCORS: true,
          logging: false,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        pdf.addPage();

        // Header bar
        pdf.setFillColor(0, 240, 255);
        pdf.rect(0, 0, pw, 14, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(10, 14, 26);
        pdf.text('Dependency Graph', margin, 9.5);

        // Graph image
        const imgW = pw - margin * 2;
        const imgH = (canvas.height / canvas.width) * imgW;
        pdf.addImage(imgData, 'JPEG', margin, 22, imgW, Math.min(imgH, ph - 40));

        // Footer
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7.5);
        pdf.setTextColor(71, 85, 105);
        pdf.text(`Generated by SecureFlow · ${ts}`, margin, ph - 10);
      }

      pdf.save(`secureflow-report-${projectName.replace(/\s+/g, '-')}-${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [scan, exporting]);

  // ── SBOM Download ─────────────────────────────────────────────────────────
  const handleDownloadSBOM = useCallback(async (format) => {
    if (!scan || sbomDownloading) return;
    setSbomDownloading(format);
    try {
      const res = await downloadSBOM(id, format);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const projectSlug = (scan.projectName ?? 'sbom').replace(/\s+/g, '-');
      if (format === 'spdx') a.download = `${projectSlug}.spdx.json`;
      else if (format === 'cyclonedx-xml') a.download = `${projectSlug}.cdx.xml`;
      else a.download = `${projectSlug}.cdx.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('SBOM download failed:', err);
    } finally {
      setSbomDownloading(null);
    }
  }, [scan, id, sbomDownloading]);



  // Module paths (Phase 6A multi-module support)
  const modules = useMemo(
    () => ['All', ...new Set((dependencies ?? []).map(d => d.modulePath || '').filter(Boolean))],
    [dependencies],
  );

  // Filter graph nodes/links by active module
  const filteredNodes = useMemo(() => {
    if (activeModule === 'All') return nodes;
    return nodes.filter(n => n.id === 'root' || n.isModuleGroup || n.modulePath === activeModule);
  }, [nodes, activeModule]);

  const filteredLinks = useMemo(() => {
    if (activeModule === 'All') return links;
    const visibleIds = new Set(filteredNodes.map(n => n.id));
    return links.filter(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      return visibleIds.has(s) && visibleIds.has(t);
    });
  }, [links, filteredNodes, activeModule]);

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
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <motion.button
                className="btn-secondary"
                onClick={handleExportPdf}
                disabled={exporting}
                whileHover={{ scale: exporting ? 1 : 1.05 }}
                whileTap={{ scale: exporting ? 1 : 0.95 }}
                style={{ fontSize: '0.85rem', opacity: exporting ? 0.65 : 1 }}
              >
                {exporting ? '⏳ Generating…' : '📄 Export PDF'}
              </motion.button>
              <motion.button
                className="btn-secondary"
                onClick={() => handleDownloadSBOM('spdx')}
                disabled={!!sbomDownloading}
                whileHover={{ scale: sbomDownloading ? 1 : 1.05 }}
                whileTap={{ scale: sbomDownloading ? 1 : 0.95 }}
                style={{ fontSize: '0.85rem', opacity: sbomDownloading === 'spdx' ? 0.65 : 1 }}
              >
                {sbomDownloading === 'spdx' ? '⏳…' : '📋 SPDX'}
              </motion.button>
              <motion.button
                className="btn-secondary"
                onClick={() => handleDownloadSBOM('cyclonedx-json')}
                disabled={!!sbomDownloading}
                whileHover={{ scale: sbomDownloading ? 1 : 1.05 }}
                whileTap={{ scale: sbomDownloading ? 1 : 0.95 }}
                style={{ fontSize: '0.85rem', opacity: sbomDownloading === 'cyclonedx-json' ? 0.65 : 1 }}
              >
                {sbomDownloading === 'cyclonedx-json' ? '⏳…' : '📋 CycloneDX'}
              </motion.button>
              <motion.button
                className="btn-secondary"
                onClick={() => handleDownloadSBOM('cyclonedx-xml')}
                disabled={!!sbomDownloading}
                whileHover={{ scale: sbomDownloading ? 1 : 1.05 }}
                whileTap={{ scale: sbomDownloading ? 1 : 0.95 }}
                style={{ fontSize: '0.85rem', opacity: sbomDownloading === 'cyclonedx-xml' ? 0.65 : 1 }}
              >
                {sbomDownloading === 'cyclonedx-xml' ? '⏳…' : '📋 CDX XML'}
              </motion.button>
              <motion.button
                className="btn-primary"
                onClick={() => navigate('/scan')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{ fontSize: '0.85rem' }}
              >
                + New Scan
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* ── Metric cards ──────────────────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
            alignItems: 'start',
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

          {modules.length > 2 && (
            <MetricCard
              title="Modules"
              value={modules.length - 1}
              subtitle="Detected workspace modules"
              variant="default"
              icon="📁"
            />
          )}

          {/* Risk gauge */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem' }}>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '0.1rem',
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
            display: 'grid',
            gridTemplateColumns: '1fr 1.6fr',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div className="glass-card">
            <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Severity Breakdown
            </h3>
            <SeverityDonut data={{
              critical: vc.critical ?? 0,
              high: vc.high ?? 0,
              medium: vc.medium ?? 0,
              low: vc.low ?? 0,
            }} />
          </div>

          <div className="glass-card">
            <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Scan Details
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <tbody>
                {[
                  { label: 'Project', value: scan?.projectName ?? 'Unknown' },
                  { label: 'Source', value: getSourceLabel(scan?.source) },
                  { label: 'Scanned', value: formatDate(scan?.createdAt) },
                  { label: 'Status', value: <span style={{ color: 'var(--severity-low)', fontWeight: 600 }}>{(scan?.status ?? 'complete').toUpperCase()}</span> },
                  { label: 'Risk Score', value: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{scan?.riskScore ?? 0}</span> },
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
                  {filteredNodes.length} / {nodes.length} nodes · {filteredLinks.length} edges
                </span>
              </h3>
              {selectedNode && (
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(0, 212, 255, 0.25)',
                    borderRadius: '6px',
                    color: 'var(--text-secondary)',
                    padding: '0.25rem 0.65rem',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                  }}
                >
                  Clear selection
                </button>
              )}
            </div>

            {/* Module filter chips (shown when scan has multiple modules) */}
            {modules.length > 2 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {modules.map(mod => (
                  <button
                    key={mod}
                    onClick={() => setActiveModule(mod)}
                    style={{
                      background: activeModule === mod ? 'rgba(0,212,255,0.18)' : 'rgba(17,24,39,0.6)',
                      border: `1px solid ${activeModule === mod ? 'rgba(0,212,255,0.55)' : 'rgba(0,212,255,0.15)'}`,
                      borderRadius: '20px',
                      color: activeModule === mod ? '#00d4ff' : 'var(--text-secondary)',
                      padding: '0.2rem 0.65rem',
                      cursor: 'pointer',
                      fontSize: '0.76rem',
                      fontFamily: 'var(--font-mono)',
                      transition: 'all 0.2s',
                    }}
                  >
                    {mod === 'All' ? '🌐 All' : `📁 ${mod}`}
                  </button>
                ))}
              </div>
            )}

            {/* Hint text */}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Click a node to inspect vulnerabilities · Double-click to expand/collapse · Scroll to zoom
            </p>

            {/* Graph container (relative for the detail panel overlay) */}
            <div
              ref={graphWrapRef}
              style={{
                position: 'relative',
                width: '100%',
                height: '560px',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(0, 212, 255, 0.06)',
              }}
            >
              {filteredNodes.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                  No dependency graph data available.
                </div>
              ) : (
                <DependencyGraph
                  nodes={filteredNodes}
                  links={filteredLinks}
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

        {/* ── License Compliance ───────────────────────────────────────── */}
        <motion.div variants={itemVariants}>
          <LicenseCompliancePanel
            licenseReport={licenseReport}
            dependencies={dependencies ?? []}
          />
        </motion.div>

        {/* ── SBOM Preview ─────────────────────────────────────────────── */}
        <motion.div variants={itemVariants}>
          <SbomPreviewPanel
            dependencies={dependencies ?? []}
            scan={scan}
          />
        </motion.div>

      </motion.div>
    </div>
  );
}
