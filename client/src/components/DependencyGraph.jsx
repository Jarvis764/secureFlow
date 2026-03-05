import React, { useRef, useEffect, useState, useMemo, useCallback, memo } from 'react';
import * as d3 from 'd3';

// ─── Severity colour palette ───────────────────────────────────────────────────
const SEVERITY_COLORS = {
  none:     '#2a3a5c',
  low:      '#00d4ff',
  medium:   '#ffb84d',
  high:     '#ff3b5c',
  critical: '#ff1744',
};

// Risk heatmap colours for non-vulnerable nodes
const RISK_HEAT = [
  { max: 0,   color: '#1e293b' },
  { max: 25,  color: '#1e3a5f' },
  { max: 50,  color: '#2d4a3e' },
  { max: 75,  color: '#5c3d1e' },
  { max: 100, color: '#5c1e1e' },
];

// Module cluster accent colours
const MODULE_PALETTE = [
  '#00d4ff', '#a855f7', '#22c55e', '#f59e0b',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316',
];

const MAX_LABEL_LENGTH = 16;
const CANVAS_THRESHOLD = 200;

// ─── Pure helpers ──────────────────────────────────────────────────────────────
function getNodeColor(node) {
  if (!node) return SEVERITY_COLORS.none;
  if ((node.vulnCount ?? 0) > 0) {
    const sev = (node.maxSeverity || 'none').toLowerCase();
    return SEVERITY_COLORS[sev] || SEVERITY_COLORS.none;
  }
  const risk = node.riskScore ?? 0;
  if (risk === 0)  return RISK_HEAT[0].color;
  if (risk <= 25)  return RISK_HEAT[1].color;
  if (risk <= 50)  return RISK_HEAT[2].color;
  if (risk <= 75)  return RISK_HEAT[3].color;
  return RISK_HEAT[4].color;
}

function getNodeRadius(node) {
  if (!node) return 6;
  if (node.id === 'root')     return 18;
  if (node.isModuleGroup)     return 14;
  return Math.max(6, Math.min(20, 4 + (node.dependentCount || 0) * 1.5));
}

function linkId(source, target) {
  const s = typeof source === 'object' ? source.id : source;
  const t = typeof target === 'object' ? target.id : target;
  return `${s}\u2192${t}`;
}

// BFS: shortest path from 'root' to targetId
function findPath(links, targetId) {
  const adj = new Map();
  links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (!adj.has(s)) adj.set(s, []);
    adj.get(s).push(t);
  });
  const visited = new Set(['root']);
  const parent  = new Map();
  const queue   = ['root'];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === targetId) {
      const pNodes = new Set();
      const pLinks = new Set();
      let c = cur;
      while (c !== undefined) {
        pNodes.add(c);
        const p = parent.get(c);
        if (p !== undefined) pLinks.add(`${p}\u2192${c}`);
        c = p;
      }
      return { pathNodes: pNodes, pathLinks: pLinks };
    }
    for (const nb of (adj.get(cur) || [])) {
      if (!visited.has(nb)) { visited.add(nb); parent.set(nb, cur); queue.push(nb); }
    }
  }
  return { pathNodes: new Set(), pathLinks: new Set() };
}

// Reverse BFS: all ancestors of vulnerable nodes
function findVulnAncestors(nodes, links) {
  const revAdj = new Map();
  links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (!revAdj.has(t)) revAdj.set(t, []);
    revAdj.get(t).push(s);
  });
  const result = new Set();
  const queue  = nodes.filter(n => (n.vulnCount ?? 0) > 0).map(n => n.id);
  queue.forEach(id => result.add(id));
  while (queue.length) {
    const cur = queue.shift();
    for (const p of (revAdj.get(cur) || [])) {
      if (!result.has(p)) { result.add(p); queue.push(p); }
    }
  }
  return result;
}

// Compute which nodes/links are visible given expandedIds
function computeVisible(nodes, links, expandedIds) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj  = new Map();
  links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (!adj.has(s)) adj.set(s, []);
    adj.get(s).push(t);
  });

  const visible = new Set();
  nodes.filter(n => n.id === 'root').forEach(n => visible.add(n.id));
  nodes.filter(n => n.isModuleGroup).forEach(n => visible.add(n.id));
  nodes.filter(n => n.depth === 0).forEach(n => visible.add(n.id));

  function expand(id) {
    (adj.get(id) || []).forEach(cId => {
      if (!visible.has(cId) && byId.has(cId)) {
        visible.add(cId);
        if (expandedIds.has(cId)) expand(cId);
      }
    });
  }
  expandedIds.forEach(id => { if (visible.has(id)) expand(id); });

  const visibleNodes = nodes.filter(n => visible.has(n.id));
  const visibleLinks = links.filter(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return visible.has(s) && visible.has(t);
  });

  const hiddenCount = new Map();
  visibleNodes.forEach(n => {
    const all = adj.get(n.id) || [];
    const hidden = all.filter(id => !visible.has(id)).length;
    if (hidden > 0) hiddenCount.set(n.id, hidden);
  });

  return { visibleNodes, visibleLinks, hiddenCount };
}

// Compute cluster centres for multi-module graphs
function computeClusters(nodes, width, height) {
  const mods = [...new Set(
    nodes.filter(n => n.modulePath && !n.isModuleGroup && n.id !== 'root').map(n => n.modulePath)
  )];
  if (mods.length <= 1) return { clusters: [], moduleColors: {} };
  const cx = width / 2;
  const cy = height / 2;
  const r  = Math.min(width, height) * 0.32;
  const clusters = mods.map((mod, i) => {
    const angle = (i / mods.length) * 2 * Math.PI - Math.PI / 2;
    return { mod, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), color: MODULE_PALETTE[i % MODULE_PALETTE.length] };
  });
  const moduleColors = Object.fromEntries(clusters.map(c => [c.mod, c.color]));
  return { clusters, moduleColors };
}

const BASE_LEGEND = [
  { label: 'None / Safe', color: SEVERITY_COLORS.none },
  { label: 'Low',         color: SEVERITY_COLORS.low },
  { label: 'Medium',      color: SEVERITY_COLORS.medium },
  { label: 'High',        color: SEVERITY_COLORS.high },
  { label: 'Critical',    color: SEVERITY_COLORS.critical },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const DependencyGraph = memo(function DependencyGraph({
  nodes = [],
  links = [],
  onNodeClick,
  width  = 800,
  height = 560,
}) {
  const svgRef    = useRef(null);
  const canvasRef = useRef(null);
  const onClickRef    = useRef(onNodeClick);
  const simRef        = useRef(null);
  const zoomRef       = useRef(null);
  const transformRef  = useRef(d3.zoomIdentity);
  const nodeDataRef   = useRef([]);
  const linkDataRef   = useRef([]);
  const rafRef        = useRef(null);
  // Live state mirror for D3 callbacks (avoids stale closures)
  const liveRef = useRef({
    pathNodes: new Set(), pathLinks: new Set(),
    vulnAncestors: new Set(), focusMode: false,
    selectedId: null, hiddenCount: new Map(),
    moduleColors: {}, zoomK: 1, expandedIds: new Set(),
  });

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [focusMode,   setFocusMode]   = useState(false);
  const [selectedId,  setSelectedId]  = useState(null);
  const [tooltip,     setTooltip]     = useState(null);
  const [, forceUpdate] = useState(0); // for triggering style updates

  useEffect(() => { onClickRef.current = onNodeClick; }, [onNodeClick]);

  // ── Derived values ────────────────────────────────────────────────────────
  const { visibleNodes, visibleLinks, hiddenCount } = useMemo(
    () => computeVisible(nodes, links, expandedIds),
    [nodes, links, expandedIds],
  );

  const useCanvas = visibleNodes.length > CANVAS_THRESHOLD;

  const { clusters, moduleColors } = useMemo(
    () => computeClusters(visibleNodes, width, height),
    [visibleNodes, width, height],
  );

  const { pathNodes, pathLinks } = useMemo(() => {
    if (!selectedId) return { pathNodes: new Set(), pathLinks: new Set() };
    return findPath(links, selectedId);
  }, [links, selectedId]);

  const vulnAncestors = useMemo(
    () => focusMode ? findVulnAncestors(visibleNodes, visibleLinks) : new Set(),
    [focusMode, visibleNodes, visibleLinks],
  );

  // ── Sync live ref ─────────────────────────────────────────────────────────
  useEffect(() => {
    liveRef.current = {
      pathNodes, pathLinks, vulnAncestors, focusMode,
      selectedId, hiddenCount, moduleColors,
      zoomK: transformRef.current.k,
      expandedIds,
    };
    // Trigger style update in D3 layer
    if (!useCanvas && svgRef.current) applyStyles();
    if (useCanvas)  scheduleCanvasDraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathNodes, pathLinks, vulnAncestors, focusMode, selectedId, hiddenCount, moduleColors, expandedIds, useCanvas]);

  // ── Opacity helpers (read from liveRef) ───────────────────────────────────
  function nodeOpacity(id) {
    const { focusMode: fm, vulnAncestors: va, selectedId: sid, pathNodes: pn } = liveRef.current;
    if (fm && !va.has(id)) return 0.15;
    if (sid && pn.size > 0 && !pn.has(id)) return 0.15;
    return 1;
  }
  function linkOpacity(sId, tId) {
    const { focusMode: fm, vulnAncestors: va, selectedId: sid, pathLinks: pl } = liveRef.current;
    const key = `${sId}\u2192${tId}`;
    if (sid && pl.size > 0 && !pl.has(key)) return 0.08;
    if (fm && (!va.has(sId) || !va.has(tId))) return 0.05;
    return 1;
  }
  function isPathLink(sId, tId) {
    return liveRef.current.pathLinks.has(`${sId}\u2192${tId}`);
  }

  // ── Apply SVG styles without restarting simulation ────────────────────────
  function applyStyles() {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const nd  = nodeDataRef.current;

    svg.selectAll('.dep-node').attr('opacity', d => nodeOpacity(d.id));
    svg.selectAll('.dep-link').each(function(d) {
      const s  = typeof d.source === 'object' ? d.source.id : d.source;
      const t  = typeof d.target === 'object' ? d.target.id : d.target;
      const op = linkOpacity(s, t);
      const onPath = isPathLink(s, t);
      const tNode  = nd.find(n => n.id === t);
      d3.select(this)
        .transition().duration(200)
        .attr('opacity',      op)
        .attr('stroke-width', onPath ? 3 : 0.75)
        .attr('stroke',       onPath
          ? 'rgba(0,212,255,0.85)'
          : (tNode?.vulnCount > 0 ? 'rgba(255,59,92,0.28)' : 'rgba(0,212,255,0.15)'));
    });
    svg.selectAll('.dep-glow').attr('opacity', d => {
      const base = nodeOpacity(d.id);
      return base < 1 ? 0.04 : 0.28;
    });
    const k = transformRef.current.k;
    svg.selectAll('.dep-label').attr('display', k > 0.8 ? null : 'none');
    // Pulse highlighted links
    pulseSVGPath(svg);
  }

  function pulseSVGPath(svg) {
    svg.selectAll('.dep-link').interrupt('pp');
    const { pathLinks: pl } = liveRef.current;
    if (!pl.size) return;
    const pathSel = svg.selectAll('.dep-link').filter(d => {
      const s = typeof d.source === 'object' ? d.source.id : d.source;
      const t = typeof d.target === 'object' ? d.target.id : d.target;
      return pl.has(`${s}\u2192${t}`);
    });
    function pulse(sel) {
      if (sel.empty() || !liveRef.current.pathLinks.size) return;
      sel.transition('pp').duration(750).ease(d3.easeSinInOut)
        .attr('stroke-width', 5).attr('stroke-opacity', 1)
        .transition('pp').duration(750).ease(d3.easeSinInOut)
        .attr('stroke-width', 3).attr('stroke-opacity', 0.55)
        .on('end', () => pulse(sel));
    }
    pulse(pathSel);
  }

  // ── Canvas draw ────────────────────────────────────────────────────────────
  function scheduleCanvasDraw() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawCanvas());
  }

  function drawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const dpr  = window.devicePixelRatio || 1;
    const tr   = transformRef.current;
    const nd   = nodeDataRef.current;
    const ld   = linkDataRef.current;
    const { moduleColors: mc, hiddenCount: hc } = liveRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(tr.x, tr.y);
    ctx.scale(tr.k, tr.k);

    // Viewport culling bounds
    const vx0 = -tr.x / tr.k,  vy0 = -tr.y / tr.k;
    const vx1 = vx0 + width / tr.k, vy1 = vy0 + height / tr.k;
    const inVP = (x, y, pad = 30) => x > vx0-pad && x < vx1+pad && y > vy0-pad && y < vy1+pad;

    // Cluster rings
    clusters.forEach(c => {
      const cn = nd.filter(n => n.modulePath === c.mod && n.x != null);
      if (!cn.length) return;
      const cx = d3.mean(cn, n => n.x);
      const cy = d3.mean(cn, n => n.y);
      const cr = Math.max(60, d3.max(cn, n => Math.hypot(n.x - cx, n.y - cy)) + 30);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, 2 * Math.PI);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = c.color;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.22;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle   = c.color;
      ctx.font        = `10px JetBrains Mono, monospace`;
      ctx.textAlign   = 'center';
      ctx.fillText(c.mod, cx, cy - cr - 6);
      ctx.restore();
    });

    // Links
    ld.forEach(l => {
      const s = l.source, t = l.target;
      if (!s.x || !t.x) return;
      if (!inVP(s.x, s.y) && !inVP(t.x, t.y)) return;
      const onPath = isPathLink(s.id, t.id);
      const op     = linkOpacity(s.id, t.id);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = onPath
        ? `rgba(0,212,255,${op * 0.85})`
        : (t.vulnCount > 0 ? `rgba(255,59,92,${op * 0.28})` : `rgba(0,212,255,${op * 0.15})`);
      ctx.lineWidth = onPath ? 3 : 0.75;
      ctx.stroke();
    });

    // Nodes
    nd.forEach(n => {
      if (!n.x || !n.y) return;
      const r   = getNodeRadius(n);
      if (!inVP(n.x, n.y, r + 20)) return;
      const col = getNodeColor(n);
      const op  = nodeOpacity(n.id);
      ctx.globalAlpha = op;

      // Glow halo for vulnerable
      if ((n.vulnCount ?? 0) > 0) {
        const gr = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 12);
        gr.addColorStop(0, col + '88');
        gr.addColorStop(1, col + '00');
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 12, 0, 2 * Math.PI);
        ctx.fillStyle = gr;
        ctx.fill();
      }

      // Circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Label
      if (tr.k > 0.8) {
        const lbl = (n.name || n.id);
        const txt = lbl.length > MAX_LABEL_LENGTH ? lbl.slice(0, MAX_LABEL_LENGTH - 1) + '\u2026' : lbl;
        ctx.fillStyle = 'rgba(226,232,240,0.6)';
        ctx.font      = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(txt, n.x, n.y + r + 3);
        ctx.textBaseline = 'alphabetic';
      }

      // +/- indicator
      const hasHidden = hc.has(n.id);
      const isExpanded = liveRef.current.expandedIds.has(n.id);
      if (hasHidden || isExpanded) {
        const bx = n.x + r * 0.65, by = n.y - r * 0.65;
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, 2 * Math.PI);
        ctx.fillStyle   = '#1e293b';
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth   = 1;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle    = '#00d4ff';
        ctx.font         = 'bold 8px sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isExpanded ? '\u2212' : '+', bx, by);
        ctx.textBaseline = 'alphabetic';
      }

      // Hidden-children count badge
      if (hasHidden) {
        const bx = n.x + r + 4, by = n.y - r - 4;
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, 2 * Math.PI);
        ctx.fillStyle   = '#1e293b';
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth   = 1;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle    = '#00d4ff';
        ctx.font         = 'bold 7px JetBrains Mono, monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(hc.get(n.id)), bx, by);
        ctx.textBaseline = 'alphabetic';
      }

      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  // Canvas hit-test
  function hitTest(clientX, clientY) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const tr   = transformRef.current;
    const mx   = (clientX - rect.left  - tr.x) / tr.k;
    const my   = (clientY - rect.top   - tr.y) / tr.k;
    const nd   = nodeDataRef.current;
    for (let i = nd.length - 1; i >= 0; i--) {
      const n = nd[i];
      if (!n.x || !n.y) continue;
      if (Math.hypot(mx - n.x, my - n.y) <= getNodeRadius(n) + 5) return n;
    }
    return null;
  }

  // ── Main D3 simulation effect ──────────────────────────────────────────────
  useEffect(() => {
    if (visibleNodes.length === 0) return;

    // Preserve positions of nodes already in the simulation
    const oldPositions = new Map(nodeDataRef.current.map(n => [n.id, { x: n.x, y: n.y }]));

    const nodeData = visibleNodes.map(n => {
      const pos = oldPositions.get(n.id);
      if (pos) return { ...n, x: pos.x, y: pos.y };
      // New nodes start at parent position for expand animation
      const parentLink = visibleLinks.find(l => {
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return t === n.id;
      });
      if (parentLink) {
        const srcId = typeof parentLink.source === 'object' ? parentLink.source.id : parentLink.source;
        const parentPos = oldPositions.get(srcId);
        if (parentPos) return { ...n, x: parentPos.x + (Math.random() - 0.5) * 10, y: parentPos.y + (Math.random() - 0.5) * 10 };
      }
      return { ...n };
    });
    const linkData = visibleLinks.map(l => ({ ...l }));
    nodeDataRef.current = nodeData;
    linkDataRef.current = linkData;

    if (simRef.current) simRef.current.stop();

    const sim = d3.forceSimulation(nodeData)
      .alphaDecay(0.025)
      .force('link',    d3.forceLink(linkData).id(d => d.id).distance(70).strength(0.5))
      .force('charge',  d3.forceManyBody().strength(-280))
      .force('collide', d3.forceCollide().radius(d => getNodeRadius(d) + 6));

    if (clusters.length > 0) {
      sim
        .force('x', d3.forceX().x(d => {
          const cl = clusters.find(c => c.mod === d.modulePath);
          return cl ? cl.x : width / 2;
        }).strength(0.18))
        .force('y', d3.forceY().y(d => {
          const cl = clusters.find(c => c.mod === d.modulePath);
          return cl ? cl.y : height / 2;
        }).strength(0.18));
    } else {
      sim.force('center', d3.forceCenter(width / 2, height / 2));
    }

    simRef.current = sim;

    if (useCanvas) {
      // Canvas mode
      if (!canvasRef.current) return;
      const dpr    = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width  = width  * dpr;
      canvas.height = height * dpr;

      const zoom = d3.zoom()
        .scaleExtent([0.05, 6])
        .on('zoom', e => {
          transformRef.current = e.transform;
          liveRef.current.zoomK = e.transform.k;
          drawCanvas();
        });
      d3.select(canvas).call(zoom).on('dblclick.zoom', null);
      zoomRef.current = zoom;
      // Restore previous transform
      d3.select(canvas).call(zoom.transform, transformRef.current);

      sim.on('tick', drawCanvas);
    } else {
      // SVG mode
      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      // Defs
      const defs = svg.append('defs');
      const glowF = defs.append('filter').attr('id', 'dg-glow')
        .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
      glowF.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', 4).attr('result', 'blur');
      const gm = glowF.append('feMerge');
      gm.append('feMergeNode').attr('in', 'blur');
      gm.append('feMergeNode').attr('in', 'SourceGraphic');

      const g = svg.append('g').attr('class', 'zoom-g');
      const zoom = d3.zoom()
        .scaleExtent([0.05, 6])
        .on('zoom', e => {
          g.attr('transform', e.transform);
          transformRef.current = e.transform;
          liveRef.current.zoomK = e.transform.k;
          // Toggle labels based on zoom
          g.selectAll('.dep-label').attr('display', e.transform.k > 0.8 ? null : 'none');
        });
      d3.select(svgRef.current).call(zoom).on('dblclick.zoom', null);
      zoomRef.current = zoom;
      d3.select(svgRef.current).call(zoom.transform, transformRef.current);

      // Background click
      d3.select(svgRef.current).on('click', () => {
        setSelectedId(null);
        setTooltip(null);
      });

      // ── Cluster rings ────────────────────────────────────────────────────
      if (clusters.length > 0) {
        const cg = g.append('g').attr('class', 'cluster-layer');
        clusters.forEach(cl => {
          const cn = nodeData.filter(n => n.modulePath === cl.mod);
          const cr = Math.max(60, Math.sqrt(cn.length) * 35);
          cg.append('circle').attr('class', `cl-ring cl-${cl.mod.replace(/\W/g, '_')}`)
            .attr('cx', cl.x).attr('cy', cl.y).attr('r', cr)
            .attr('fill', 'none').attr('stroke', cl.color)
            .attr('stroke-width', 1.5).attr('stroke-dasharray', '6,4')
            .attr('opacity', 0.22).attr('pointer-events', 'none');
          cg.append('text').attr('class', `cl-label cl-lbl-${cl.mod.replace(/\W/g, '_')}`)
            .attr('x', cl.x).attr('y', cl.y - cr - 6)
            .attr('text-anchor', 'middle').attr('font-size', '10px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('fill', cl.color).attr('opacity', 0.6)
            .attr('pointer-events', 'none').text(cl.mod);
        });
      }

      // ── Links ─────────────────────────────────────────────────────────────
      const linkSel = g.append('g').attr('class', 'link-layer')
        .selectAll('line').data(linkData).join('line')
        .attr('class', 'dep-link')
        .attr('stroke-width', 0.75)
        .attr('stroke', d => {
          const t = typeof d.target === 'object' ? d.target : nodeData.find(n => n.id === d.target);
          return (t?.vulnCount ?? 0) > 0 ? 'rgba(255,59,92,0.28)' : 'rgba(0,212,255,0.15)';
        });

      // ── Glow halos ────────────────────────────────────────────────────────
      const vulnData = nodeData.filter(n => (n.vulnCount ?? 0) > 0);
      const glowSel  = g.append('g').attr('class', 'glow-layer')
        .selectAll('circle').data(vulnData).join('circle')
        .attr('class', 'dep-glow')
        .attr('r',       d => getNodeRadius(d) + 8)
        .attr('fill',    d => getNodeColor(d))
        .attr('opacity', 0.28)
        .attr('filter',  'url(#dg-glow)')
        .attr('pointer-events', 'none');

      // Pulse critical glows
      function pulseCrit(sel) {
        if (sel.empty()) return;
        sel.transition().duration(900).ease(d3.easeSinInOut)
          .attr('r', d => getNodeRadius(d) + 14).attr('opacity', 0.55)
          .transition().duration(900).ease(d3.easeSinInOut)
          .attr('r', d => getNodeRadius(d) + 6).attr('opacity', 0.18)
          .on('end', () => pulseCrit(sel));
      }
      pulseCrit(glowSel.filter(d => d.maxSeverity?.toLowerCase() === 'critical'));

      // ── Node groups ───────────────────────────────────────────────────────
      const nodeSel = g.append('g').attr('class', 'node-layer')
        .selectAll('g').data(nodeData).join('g')
        .attr('class', 'dep-node')
        .style('cursor', 'pointer')
        .style('will-change', 'transform');

      // Main circle
      nodeSel.append('circle')
        .attr('r',             d => getNodeRadius(d))
        .attr('fill',          d => getNodeColor(d))
        .attr('fill-opacity',  d => (d.vulnCount ?? 0) > 0 ? 1 : 0.7)
        .attr('stroke',        d => getNodeColor(d))
        .attr('stroke-width',  d => 1 + (d.riskScore ?? 0) / 60)
        .attr('stroke-opacity', 0.85);

      // +/- expand indicator
      nodeSel.filter(d => liveRef.current.hiddenCount.has(d.id) || expandedIds.has(d.id))
        .append('text').attr('class', 'dep-expand-icon')
        .attr('x', d => getNodeRadius(d) * 0.65).attr('y', d => -getNodeRadius(d) * 0.65)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('font-size', '10px').attr('font-weight', 'bold')
        .attr('fill', '#ffffff').attr('pointer-events', 'none')
        .text(d => liveRef.current.expandedIds.has(d.id) ? '\u2212' : '+');

      // Hidden-children count badge
      const badgeData = nodeData.filter(d => liveRef.current.hiddenCount.has(d.id));
      const badgeG = nodeSel.filter(d => liveRef.current.hiddenCount.has(d.id));
      badgeG.append('circle')
        .attr('cx', d => getNodeRadius(d) + 4).attr('cy', d => -(getNodeRadius(d) + 4))
        .attr('r', 7).attr('fill', '#1e293b').attr('stroke', '#00d4ff').attr('stroke-width', 1)
        .attr('pointer-events', 'none');
      badgeG.append('text')
        .attr('x', d => getNodeRadius(d) + 4).attr('y', d => -(getNodeRadius(d) + 4))
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('font-size', '7px').attr('font-weight', 'bold')
        .attr('fill', '#00d4ff').attr('pointer-events', 'none')
        .text(d => liveRef.current.hiddenCount.get(d.id));

      // Label
      nodeSel.append('text').attr('class', 'dep-label')
        .text(d => {
          const lbl = d.name || d.id;
          return lbl.length > MAX_LABEL_LENGTH ? lbl.slice(0, MAX_LABEL_LENGTH - 1) + '\u2026' : lbl;
        })
        .attr('x', 0).attr('y', d => getNodeRadius(d) + 11)
        .attr('text-anchor', 'middle').attr('font-size', '9px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('fill', 'rgba(226,232,240,0.6)')
        .attr('pointer-events', 'none');

      // ── Drag ──────────────────────────────────────────────────────────────
      nodeSel.call(
        d3.drag()
          .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
          .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }),
      );

      // ── Events ────────────────────────────────────────────────────────────
      let clickTimer = null;
      nodeSel
        .on('mouseenter', (ev, d) => {
          const rect = svgRef.current.getBoundingClientRect();
          setTooltip({ x: ev.clientX - rect.left + 14, y: ev.clientY - rect.top - 10, node: d });
          d3.select(ev.currentTarget).select('circle').transition().duration(120).attr('r', getNodeRadius(d) * 1.35);
        })
        .on('mousemove', ev => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            setTooltip(p => p ? { ...p, x: ev.clientX - rect.left + 14, y: ev.clientY - rect.top - 10 } : null);
          });
        })
        .on('mouseleave', (ev, d) => {
          setTooltip(null);
          d3.select(ev.currentTarget).select('circle').transition().duration(120).attr('r', getNodeRadius(d));
        })
        .on('click', (ev, d) => {
          ev.stopPropagation();
          if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
          clickTimer = setTimeout(() => {
            clickTimer = null;
            setSelectedId(prev => prev === d.id ? null : d.id);
            if (onClickRef.current) onClickRef.current(d);
          }, 220);
        })
        .on('dblclick', (ev, d) => {
          ev.stopPropagation();
          if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
          setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
            return next;
          });
        });

      // ── Tick ──────────────────────────────────────────────────────────────
      sim.on('tick', () => {
        linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
               .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        glowSel.attr('cx', d => d.x).attr('cy', d => d.y);
        nodeSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);

        // Dynamic cluster ring positions
        if (clusters.length > 0) {
          clusters.forEach(cl => {
            const cn = nodeData.filter(n => n.modulePath === cl.mod && n.x != null);
            if (!cn.length) return;
            const cx = d3.mean(cn, n => n.x);
            const cy = d3.mean(cn, n => n.y);
            const cr = Math.max(60, d3.max(cn, n => Math.hypot(n.x - cx, n.y - cy)) + 30);
            g.select(`.cl-${cl.mod.replace(/\W/g, '_')}`).attr('cx', cx).attr('cy', cy).attr('r', cr);
            g.select(`.cl-lbl-${cl.mod.replace(/\W/g, '_')}`).attr('x', cx).attr('y', cy - cr - 6);
          });
        }

        // Apply live opacity
        linkSel.attr('opacity', d => {
          const s = d.source.id, t = d.target.id;
          return linkOpacity(s, t);
        });
        nodeSel.attr('opacity', d => nodeOpacity(d.id));
        glowSel.attr('opacity', d => nodeOpacity(d.id) < 1 ? 0.04 : 0.28);
        const k = transformRef.current.k;
        nodeSel.selectAll('.dep-label').attr('display', k > 0.8 ? null : 'none');
      });
    }

    return () => { if (simRef.current) simRef.current.stop(); };
  // Using .length instead of full arrays: we rebuild the simulation only when the
  // visible set SIZE changes, not on every identity change. Style updates (opacity,
  // stroke) are handled separately by the liveRef sync effect above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes.length, visibleLinks.length, width, height, clusters.length, useCanvas]);

  // ── Canvas event handlers ──────────────────────────────────────────────────
  const canvasClickTimer = useRef(null);

  const handleCanvasMouseMove = useCallback(ev => {
    const node = hitTest(ev.clientX, ev.clientY);
    if (node) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setTooltip({ x: ev.clientX - rect.left + 14, y: ev.clientY - rect.top - 10, node });
      });
    } else {
      setTooltip(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCanvasClick = useCallback(ev => {
    const node = hitTest(ev.clientX, ev.clientY);
    if (!node) { setSelectedId(null); setTooltip(null); return; }
    if (canvasClickTimer.current) { clearTimeout(canvasClickTimer.current); canvasClickTimer.current = null; return; }
    canvasClickTimer.current = setTimeout(() => {
      canvasClickTimer.current = null;
      setSelectedId(prev => prev === node.id ? null : node.id);
      if (onClickRef.current) onClickRef.current(node);
    }, 220);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCanvasDblClick = useCallback(ev => {
    if (canvasClickTimer.current) { clearTimeout(canvasClickTimer.current); canvasClickTimer.current = null; }
    const node = hitTest(ev.clientX, ev.clientY);
    if (!node) return;
    setExpandedIds(prev => { const next = new Set(prev); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Toolbar actions ────────────────────────────────────────────────────────
  const handleExpandAll    = useCallback(() => setExpandedIds(new Set(nodes.map(n => n.id))), [nodes]);
  const handleCollapseAll  = useCallback(() => setExpandedIds(new Set()), []);
  const handleResetView    = useCallback(() => {
    const el = useCanvas ? canvasRef.current : svgRef.current;
    if (!el || !zoomRef.current) return;
    d3.select(el).transition().duration(300).call(zoomRef.current.transform, d3.zoomIdentity);
    transformRef.current = d3.zoomIdentity;
  }, [useCanvas]);

  // ── Legend ────────────────────────────────────────────────────────────────
  const legend = [
    ...BASE_LEGEND,
    { label: 'Expandable', color: '#94a3b8', dashed: true },
    ...Object.entries(moduleColors).map(([mod, color]) => ({ label: `📁 ${mod}`, color })),
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', zIndex: 20, display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Expand All',   fn: handleExpandAll },
          { label: 'Collapse All', fn: handleCollapseAll },
          { label: focusMode ? '🔍 Focus ON' : '🔍 Focus Vulns', fn: () => setFocusMode(f => !f), active: focusMode },
          { label: 'Reset View',   fn: handleResetView },
        ].map(({ label, fn, active }) => (
          <button key={label} onClick={fn} style={{
            background:     active ? 'rgba(0,212,255,0.18)' : 'rgba(17,24,39,0.85)',
            border:         `1px solid ${active ? 'rgba(0,212,255,0.55)' : 'rgba(0,212,255,0.18)'}`,
            borderRadius:   '6px',
            color:          active ? '#00d4ff' : '#94a3b8',
            padding:        '0.2rem 0.5rem',
            cursor:         'pointer',
            fontSize:       '0.71rem',
            fontFamily:     'JetBrains Mono, monospace',
            backdropFilter: 'blur(8px)',
            transition:     'all 0.2s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Node count badge */}
      <div style={{
        position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 20,
        fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace',
        color: '#475569', background: 'rgba(17,24,39,0.75)',
        padding: '0.2rem 0.5rem', borderRadius: '4px', pointerEvents: 'none',
      }}>
        {visibleNodes.length} / {nodes.length} nodes · {useCanvas ? 'Canvas' : 'SVG'}
      </div>

      {/* Graph surface */}
      {useCanvas ? (
        <canvas
          ref={canvasRef}
          style={{ width, height, display: 'block', cursor: 'grab' }}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setTooltip(null)}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDblClick}
        />
      ) : (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ display: 'block', background: 'transparent', willChange: 'transform' }}
        />
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y,
          background: 'rgba(17,24,39,0.96)', border: '1px solid rgba(0,212,255,0.2)',
          borderRadius: '8px', padding: '0.5rem 0.75rem',
          fontSize: '0.76rem', fontFamily: 'JetBrains Mono, monospace',
          pointerEvents: 'none', zIndex: 30, minWidth: '168px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}>
          <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>
            {tooltip.node.name || tooltip.node.id}
          </div>
          {tooltip.node.version && (
            <div style={{ color: '#94a3b8', marginBottom: '0.15rem' }}>v{tooltip.node.version}</div>
          )}
          {tooltip.node.modulePath && (
            <div style={{ color: '#94a3b8', marginBottom: '0.15rem' }}>
              Module: <span style={{ color: moduleColors[tooltip.node.modulePath] || '#94a3b8', fontWeight: 600 }}>{tooltip.node.modulePath}</span>
            </div>
          )}
          <div style={{ color: '#94a3b8' }}>
            Vulns: <span style={{ color: (tooltip.node.vulnCount ?? 0) > 0 ? '#ff3b5c' : '#22c55e', fontWeight: 600 }}>{tooltip.node.vulnCount ?? 0}</span>
          </div>
          <div style={{ color: '#94a3b8' }}>
            Severity: <span style={{ color: getNodeColor(tooltip.node), fontWeight: 600 }}>
              {tooltip.node.maxSeverity ? tooltip.node.maxSeverity.toUpperCase() : 'NONE'}
            </span>
          </div>
          <div style={{ color: '#94a3b8' }}>
            Risk: <span style={{ color: '#00d4ff', fontWeight: 600 }}>{tooltip.node.riskScore ?? 0}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: '0.75rem', left: '0.75rem',
        display: 'flex', gap: '0.7rem', flexWrap: 'wrap',
        background: 'rgba(17,24,39,0.7)', backdropFilter: 'blur(8px)',
        borderRadius: '8px', padding: '0.4rem 0.75rem',
        border: '1px solid rgba(0,212,255,0.08)', pointerEvents: 'none', maxWidth: '65%',
      }}>
        {legend.map(({ label, color, dashed }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background:  dashed ? 'transparent' : color,
              border:      dashed ? `1.5px dashed ${color}` : `1px solid ${color}`,
              boxShadow:   dashed ? 'none' : `0 0 5px ${color}`,
            }} />
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: '0.75rem', right: '0.75rem',
        fontSize: '0.68rem', color: '#334155', fontFamily: 'JetBrains Mono, monospace',
        pointerEvents: 'none',
      }}>
        Click to select · Double-click to expand/collapse
      </div>

    </div>
  );
});

export default DependencyGraph;
