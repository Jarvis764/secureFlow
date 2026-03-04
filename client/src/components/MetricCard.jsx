import React from 'react';
import { motion } from 'framer-motion';
import { useCountUp } from '../hooks/useCountUp';

const VARIANT_COLORS = {
  default: 'var(--accent-cyan)',
  danger:  'var(--severity-critical)',
  warning: 'var(--severity-high)',
  success: 'var(--severity-low)',
};

const VARIANT_GLOW = {
  default: 'rgba(0, 240, 255, 0.15)',
  danger:  'rgba(239, 68, 68, 0.15)',
  warning: 'rgba(249, 115, 22, 0.15)',
  success: 'rgba(34, 197, 94, 0.15)',
};

/**
 * Glassmorphism metric card with an animated count-up number.
 *
 * @param {object} props
 * @param {string}  props.title    - Card title displayed above the value.
 * @param {number}  props.value    - Numeric value (animated on mount).
 * @param {string}  [props.subtitle] - Muted text below the value.
 * @param {'default'|'danger'|'warning'|'success'} [props.variant='default']
 * @param {React.ReactNode} [props.icon] - Icon element shown on the right.
 * @param {number}  [props.delay=0]  - Framer Motion stagger delay in seconds.
 */
export default function MetricCard({ title, value = 0, subtitle, variant = 'default', icon, delay = 0 }) {
  const animated = useCountUp(Number(value) || 0);
  const color     = VARIANT_COLORS[variant] ?? VARIANT_COLORS.default;
  const glowColor = VARIANT_GLOW[variant]   ?? VARIANT_GLOW.default;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
      whileHover={{ scale: 1.02, boxShadow: `0 8px 32px ${glowColor}` }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        boxShadow: `0 4px 24px rgba(0, 0, 0, 0.4)`,
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      {/* Left accent bar */}
      <div style={{
        width: '4px',
        flexShrink: 0,
        background: color,
        boxShadow: `0 0 12px ${color}`,
      }} />

      {/* Card content */}
      <div style={{ flex: 1, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {title}
          </span>
          {icon && (
            <span style={{ color, opacity: 0.8, fontSize: '1.25rem', lineHeight: 1 }}>
              {icon}
            </span>
          )}
        </div>

        <motion.span
          key={value}
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            display: 'block',
            fontSize: '2.25rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color,
            lineHeight: 1.1,
            textShadow: `0 0 20px ${color}40`,
          }}
        >
          {animated.toLocaleString()}
        </motion.span>

        {subtitle && (
          <span style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            marginTop: '0.1rem',
          }}>
            {subtitle}
          </span>
        )}
      </div>
    </motion.div>
  );
}
