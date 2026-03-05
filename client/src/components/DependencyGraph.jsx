import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

// ─── Severity colour palette (matches problem-statement spec) ───────────────
const SEVERITY_COLORS = {
  none:     '#2a3a5c',
  low:      '#00d4ff',
  medium:   '#ffb84d',
  high:     '#ff3b5c',
  critical: '#ff1744',
};

function getNodeColor(maxSeverity) {
  if (!maxSeverity) return SEVERITY_COLORS.none;
  return SEVERITY_COLORS[maxSeverity.toLowerCase()] || SEVERITY_COLORS.none;
}

function getNodeRadius(dependentCount) {
  return Math.max(6, Math.min(25, 4 + (dependentCount || 0) * 2));
}

// Maximum characters to display in a node label before truncating
const MAX_LABEL_LENGTH = 16;

// ─── Legend items ─────────────────────────────────────────────────────────
const LEGEND = [
  { label: 'None / Safe', color: SEVERITY_COLORS.none },
  { label: 'Low',         color: SEVERITY_COLORS.low },
  { label: 'Medium',      color: SEVERITY_COLORS.medium },
  { label: 'High',        color: SEVERITY_COLORS.high },
  { label: 'Critical',    color: SEVERITY_COLORS.critical },
];

/**
 * Interactive D3 force-directed dependency graph.
 *
 * @param {object}   props
 * @param {Array}    props.nodes        – graph node objects
 * @param {Array}    props.links        – graph link objects { source, target }
 * @param {Function} props.onNodeClick  – called with the clicked node datum
 * @param {number}   [props.width=800]
 * @param {number}   [props.height=560]
 */
export default function DependencyGraph({
  nodes = [],
  links = [],
  onNodeClick,
  width  = 800,
  height = 560,
}) {
  const svgRef       = useRef(null);
  const onClickRef   = useRef(onNodeClick);
  const [tooltip, setTooltip] = useState(null);

  // Keep the callback ref fresh without re-triggering the D3 effect
  useEffect(() => { onClickRef.current = onNodeClick; }, [onNodeClick]);

  // ── Main D3 effect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // ── Defs: glow filter ──────────────────────────────────────────────────
    const defs   = svg.append('defs');
    const filter = defs.append('filter')
      .attr('id',     'node-glow')
      .attr('x',      '-60%')
      .attr('y',      '-60%')
      .attr('width',  '220%')
      .attr('height', '220%');
    filter.append('feGaussianBlur')
      .attr('in',         'SourceGraphic')
      .attr('stdDeviation', 4)
      .attr('result',     'blur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // ── Zoom / pan ────────────────────────────────────────────────────────
    const g    = svg.append('g');
    const zoom = d3.zoom()
      .scaleExtent([0.05, 6])
      .on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('click', () => setTooltip(null));

    // ── Clone data (D3 simulation mutates objects) ─────────────────────────
    const nodeData = nodes.map((d) => ({ ...d }));
    const linkData = links.map((d) => ({ ...d }));

    // ── Force simulation ──────────────────────────────────────────────────
    const simulation = d3.forceSimulation(nodeData)
      .alphaDecay(0.02)
      .force('link',    d3.forceLink(linkData).id((d) => d.id).distance(60))
      .force('charge',  d3.forceManyBody().strength(-200))
      .force('center',  d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d) => getNodeRadius(d.dependentCount) + 5));

    // ── Links ─────────────────────────────────────────────────────────────
    const linkSel = g.append('g').attr('class', 'links')
      .selectAll('line')
      .data(linkData)
      .join('line')
      .attr('stroke-width', 0.75);

    // ── Glow halos for vulnerable nodes ───────────────────────────────────
    const vulnNodeData = nodeData.filter((d) => d.vulnCount > 0);
    const glowSel = g.append('g').attr('class', 'glows')
      .selectAll('circle')
      .data(vulnNodeData)
      .join('circle')
      .attr('r',               (d) => getNodeRadius(d.dependentCount) + 8)
      .attr('fill',            (d) => getNodeColor(d.maxSeverity))
      .attr('opacity',         0.3)
      .attr('filter',          'url(#node-glow)')
      .attr('pointer-events',  'none');

    // Pulsing animation for CRITICAL nodes
    function pulseCritical(sel) {
      if (sel.empty()) return;
      sel
        .transition().duration(900).ease(d3.easeSinInOut)
        .attr('r',       (d) => getNodeRadius(d.dependentCount) + 14)
        .attr('opacity', 0.55)
        .transition().duration(900).ease(d3.easeSinInOut)
        .attr('r',       (d) => getNodeRadius(d.dependentCount) + 6)
        .attr('opacity', 0.18)
        .on('end', () => pulseCritical(sel));
    }
    const criticalGlows = glowSel.filter(
      (d) => d.maxSeverity && d.maxSeverity.toLowerCase() === 'critical',
    );
    pulseCritical(criticalGlows);

    // ── Node groups ───────────────────────────────────────────────────────
    const nodeSel = g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(nodeData)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer');

    // Circle
    nodeSel.append('circle')
      .attr('r',            (d) => getNodeRadius(d.dependentCount))
      .attr('fill',         (d) => getNodeColor(d.maxSeverity))
      .attr('fill-opacity', (d) => (d.maxSeverity ? 1 : 0.6))
      .attr('stroke',       (d) => getNodeColor(d.maxSeverity))
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.8);

    // Label
    nodeSel.append('text')
      .text((d) => (d.name.length > MAX_LABEL_LENGTH ? d.name.slice(0, MAX_LABEL_LENGTH - 1) + '…' : d.name))
      .attr('x',            0)
      .attr('y',            (d) => getNodeRadius(d.dependentCount) + 11)
      .attr('text-anchor',  'middle')
      .attr('font-size',    '9px')
      .attr('font-family',  'JetBrains Mono, monospace')
      .attr('fill',         'rgba(226, 232, 240, 0.6)')
      .attr('pointer-events', 'none');

    // ── Drag ──────────────────────────────────────────────────────────────
    nodeSel.call(
      d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end',  (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    // ── Hover tooltip ─────────────────────────────────────────────────────
    nodeSel
      .on('mouseenter', (event, d) => {
        const rect = svgRef.current.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left + 14, y: event.clientY - rect.top - 10, node: d });
        d3.select(event.currentTarget).select('circle')
          .transition().duration(120)
          .attr('r', getNodeRadius(d.dependentCount) * 1.35);
      })
      .on('mousemove', (event) => {
        const rect = svgRef.current.getBoundingClientRect();
        setTooltip((prev) =>
          prev ? { ...prev, x: event.clientX - rect.left + 14, y: event.clientY - rect.top - 10 } : null,
        );
      })
      .on('mouseleave', (event, d) => {
        setTooltip(null);
        d3.select(event.currentTarget).select('circle')
          .transition().duration(120)
          .attr('r', getNodeRadius(d.dependentCount));
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        if (onClickRef.current) onClickRef.current(d);
      });

    // ── Simulation tick ───────────────────────────────────────────────────
    simulation.on('tick', () => {
      // Update link colours based on resolved target node
      linkSel
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)
        .attr('stroke', (d) =>
          d.target?.vulnCount > 0
            ? 'rgba(255, 59, 92, 0.18)'
            : 'rgba(0, 212, 255, 0.1)',
        );

      glowSel
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y);

      nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { simulation.stop(); };
  }, [nodes, links, width, height]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block', background: 'transparent' }}
      />

      {/* Hover tooltip */}
      {tooltip && (
        <div
          style={{
            position:       'absolute',
            left:           tooltip.x,
            top:            tooltip.y,
            background:     'rgba(17, 24, 39, 0.96)',
            border:         '1px solid rgba(0, 212, 255, 0.2)',
            borderRadius:   '8px',
            padding:        '0.5rem 0.75rem',
            fontSize:       '0.76rem',
            fontFamily:     'JetBrains Mono, monospace',
            pointerEvents:  'none',
            zIndex:         10,
            minWidth:       '168px',
            boxShadow:      '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>
            {tooltip.node.name}
          </div>
          {tooltip.node.version && (
            <div style={{ color: '#94a3b8', marginBottom: '0.15rem' }}>v{tooltip.node.version}</div>
          )}
          <div style={{ color: '#94a3b8' }}>
            Vulns:{' '}
            <span style={{ color: tooltip.node.vulnCount > 0 ? '#ff3b5c' : '#22c55e', fontWeight: 600 }}>
              {tooltip.node.vulnCount}
            </span>
          </div>
          <div style={{ color: '#94a3b8' }}>
            Severity:{' '}
            <span style={{ color: getNodeColor(tooltip.node.maxSeverity), fontWeight: 600 }}>
              {tooltip.node.maxSeverity ? tooltip.node.maxSeverity.toUpperCase() : 'NONE'}
            </span>
          </div>
          <div style={{ color: '#94a3b8' }}>
            Risk:{' '}
            <span style={{ color: '#00d4ff', fontWeight: 600 }}>{tooltip.node.riskScore ?? 0}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position:       'absolute',
          bottom:         '0.75rem',
          left:           '0.75rem',
          display:        'flex',
          gap:            '0.75rem',
          flexWrap:       'wrap',
          background:     'rgba(17, 24, 39, 0.7)',
          backdropFilter: 'blur(8px)',
          borderRadius:   '8px',
          padding:        '0.4rem 0.75rem',
          border:         '1px solid rgba(0, 212, 255, 0.08)',
          pointerEvents:  'none',
        }}
      >
        {LEGEND.map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{
              width:        '8px',
              height:       '8px',
              borderRadius: '50%',
              background:   color,
              boxShadow:    `0 0 5px ${color}`,
              flexShrink:   0,
            }} />
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
