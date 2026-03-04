import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useCountUp } from '../hooks/useCountUp';

/** Convert polar (0° = top, clockwise) to SVG Cartesian. */
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/** Build an SVG arc path string. */
function describeArc(cx, cy, r, startAngle, endAngle) {
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  // avoid degenerate full-circle (identical start/end points)
  const clampedEnd = endAngle === startAngle ? startAngle + 0.001 : endAngle;
  const ep = polarToCartesian(cx, cy, r, clampedEnd);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${ep.x.toFixed(2)} ${ep.y.toFixed(2)}`;
}

/** Returns the arc color for a given score. */
function getArcColor(score) {
  if (score <= 30) return '#22c55e';
  if (score <= 60) return '#eab308';
  if (score <= 80) return '#f97316';
  return '#ef4444';
}

/** Returns the risk label for a given score. */
function getRiskLabel(score) {
  if (score <= 30) return 'Low Risk';
  if (score <= 60) return 'Medium Risk';
  if (score <= 80) return 'High Risk';
  return 'Critical Risk';
}

const GAUGE_START = 135;   // degrees (0° = top, clockwise)
const GAUGE_SPAN  = 270;   // total arc span in degrees

/**
 * SVG-based arc gauge displaying a risk score from 0–100.
 *
 * @param {object} props
 * @param {number} [props.score=0] - Risk score (0–100).
 * @param {number} [props.size=220] - SVG canvas size in px.
 */
export default function RiskGauge({ score = 0, size = 220 }) {
  const animatedScore = useCountUp(Math.min(Math.max(score, 0), 100));
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.37;
  const strokeWidth = size * 0.07;

  const bgEnd  = GAUGE_START + GAUGE_SPAN;
  const arcEnd = GAUGE_START + GAUGE_SPAN * (animatedScore / 100);

  const bgPath   = describeArc(cx, cy, r, GAUGE_START, bgEnd);
  const arcPath  = describeArc(cx, cy, r, GAUGE_START, arcEnd);
  const arcColor = getArcColor(animatedScore);
  const riskLabel = getRiskLabel(animatedScore);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size}`} overflow="visible">
        {/* Glow filter */}
        <defs>
          <filter id="arc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Score arc */}
        {animatedScore > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            filter="url(#arc-glow)"
            style={{ transition: 'stroke 0.3s ease' }}
          />
        )}

        {/* Center: score */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={arcColor}
          fontSize={size * 0.18}
          fontWeight="700"
          fontFamily="var(--font-mono)"
          style={{ textShadow: `0 0 16px ${arcColor}` }}
        >
          {animatedScore}
        </text>

        {/* Center: label */}
        <text
          x={cx}
          y={cy + size * 0.13}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-secondary)"
          fontSize={size * 0.07}
          fontWeight="500"
          fontFamily="var(--font-sans)"
        >
          {riskLabel}
        </text>
      </svg>
    </motion.div>
  );
}
