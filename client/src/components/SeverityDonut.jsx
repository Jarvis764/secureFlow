import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

const COLORS = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
};

const LABELS = {
  critical: 'Critical',
  high:     'High',
  medium:   'Medium',
  low:      'Low',
};

/**
 * Recharts donut chart showing vulnerability severity distribution.
 *
 * @param {object} props
 * @param {{ critical: number, high: number, medium: number, low: number }} props.data
 */
export default function SeverityDonut({ data = {} }) {
  const { critical = 0, high = 0, medium = 0, low = 0 } = data;
  const total = critical + high + medium + low;

  const chartData = [
    { name: 'critical', value: critical },
    { name: 'high',     value: high },
    { name: 'medium',   value: medium },
    { name: 'low',      value: low },
  ].filter((d) => d.value > 0);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0].payload;
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '0.5rem 0.75rem',
        fontSize: '0.85rem',
      }}>
        <span style={{ color: COLORS[name], fontWeight: 600 }}>{LABELS[name]}: </span>
        <span style={{ color: 'var(--text-primary)' }}>{value}</span>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {total === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          No vulnerabilities found
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                isAnimationActive
                animationBegin={0}
                animationDuration={900}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={COLORS[entry.name]} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Center total */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}>
              {total}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              TOTAL
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem 1rem',
        marginTop: '0.75rem',
        justifyContent: 'center',
      }}>
        {Object.entries(LABELS).map(([key, label]) => {
          const count = data[key] ?? 0;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: COLORS[key],
                flexShrink: 0,
                boxShadow: `0 0 6px ${COLORS[key]}`,
              }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {label}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
