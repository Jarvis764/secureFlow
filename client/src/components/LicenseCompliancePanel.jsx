import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Color palette aligned with existing CSS custom properties
const CATEGORY_COLORS = {
  permissive: 'var(--severity-low)',   // green
  copyleft: 'var(--severity-medium)',  // yellow/orange
  unknown: 'var(--text-secondary)',    // gray
};

// Hex equivalents used for recharts (which requires real color values)
const CATEGORY_HEX = {
  permissive: '#22c55e',
  copyleft: '#f59e0b',
  unknown: '#64748b',
};

function CategoryBadge({ category }) {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.unknown;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.5rem',
        borderRadius: '12px',
        fontSize: '0.72rem',
        fontWeight: 600,
        background: `${CATEGORY_HEX[category] || '#64748b'}22`,
        color,
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      {category || 'unknown'}
    </span>
  );
}

/**
 * LicenseCompliancePanel — Visual license compliance dashboard.
 *
 * Props:
 *   licenseReport {object}  - { summary, conflicts, licenses }
 *   dependencies  {Array}   - Raw dependency objects (optional, used as fallback).
 */
export default function LicenseCompliancePanel({ licenseReport, dependencies = [] }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const licenses = licenseReport?.licenses ?? [];
  const summary = licenseReport?.summary ?? { total: 0, permissive: 0, copyleft: 0, unknown: 0 };
  const conflicts = licenseReport?.conflicts ?? [];

  // Pie chart data
  const pieData = useMemo(
    () =>
      [
        { name: 'Permissive', value: summary.permissive, key: 'permissive' },
        { name: 'Copyleft', value: summary.copyleft, key: 'copyleft' },
        { name: 'Unknown', value: summary.unknown, key: 'unknown' },
      ].filter((d) => d.value > 0),
    [summary]
  );

  // Filtered + sorted table
  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = licenses.filter((l) => !q || l.name?.toLowerCase().includes(q));

    return [...rows].sort((a, b) => {
      const av = (a[sortField] ?? '').toString().toLowerCase();
      const bv = (b[sortField] ?? '').toString().toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [licenses, search, sortField, sortDir]);

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const sortIcon = (field) => {
    if (sortField !== field) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ marginTop: '1.5rem' }}
    >
      {/* Section header */}
      <h3
        style={{
          fontSize: '0.88rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '1rem',
        }}
      >
        ⚖️ License Compliance
      </h3>

      {/* Top row: summary stats + pie chart */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* Pie chart */}
        <div style={{ height: 200 }}>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={CATEGORY_HEX[entry.key] || '#64748b'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0d1117',
                    border: '1px solid rgba(0,212,255,0.2)',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    fontSize: '0.8rem',
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
              }}
            >
              No license data available
            </div>
          )}
        </div>

        {/* Summary counts */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.6rem',
          }}
        >
          {[
            { label: 'Total Packages', value: summary.total, color: 'var(--text-primary)' },
            { label: 'Permissive', value: summary.permissive, color: CATEGORY_COLORS.permissive },
            { label: 'Copyleft', value: summary.copyleft, color: CATEGORY_COLORS.copyleft },
            { label: 'Unknown', value: summary.unknown, color: CATEGORY_COLORS.unknown },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.3rem 0',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
                {value ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Conflict warnings */}
      {conflicts.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h4
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            ⚠️ Conflicts ({conflicts.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {conflicts.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background:
                    c.severity === 'error'
                      ? 'rgba(239,68,68,0.08)'
                      : 'rgba(234,179,8,0.08)',
                  border: `1px solid ${
                    c.severity === 'error'
                      ? 'rgba(239,68,68,0.25)'
                      : 'rgba(234,179,8,0.25)'
                  }`,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '10px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background:
                      c.severity === 'error'
                        ? 'rgba(239,68,68,0.2)'
                        : 'rgba(234,179,8,0.2)',
                    color:
                      c.severity === 'error'
                        ? 'var(--severity-critical)'
                        : 'var(--severity-medium)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {c.severity.toUpperCase()}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  {c.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* License table */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.6rem',
            flexWrap: 'wrap',
          }}
        >
          <h4
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            All Packages
          </h4>
          <input
            type="text"
            placeholder="Filter packages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: '1 1 160px',
              maxWidth: '280px',
              background: 'rgba(17,24,39,0.7)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              padding: '0.35rem 0.65rem',
              fontSize: '0.8rem',
              outline: 'none',
            }}
          />
        </div>

        <div
          style={{
            overflowX: 'auto',
            maxHeight: '320px',
            overflowY: 'auto',
            borderRadius: '6px',
            border: '1px solid rgba(0,212,255,0.08)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8rem',
              minWidth: '420px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                {[
                  { label: 'Package', field: 'name' },
                  { label: 'Version', field: 'version' },
                  { label: 'License', field: 'license' },
                  { label: 'Category', field: 'category' },
                ].map(({ label, field }) => (
                  <th
                    key={field}
                    onClick={() => toggleSort(field)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'left',
                      color: sortField === field ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                    {sortIcon(field)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: '1.5rem',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    No packages match the current filter.
                  </td>
                </tr>
              ) : (
                tableRows.map((row, i) => (
                  <tr
                    key={`${row.name}@${row.version}`}
                    style={{
                      background: i % 2 === 0 ? 'rgba(17,24,39,0.3)' : 'rgba(17,24,39,0.5)',
                      borderBottom: '1px solid rgba(0,212,255,0.04)',
                    }}
                  >
                    <td
                      style={{
                        padding: '0.45rem 0.75rem',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.name}
                    </td>
                    <td
                      style={{
                        padding: '0.45rem 0.75rem',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.version}
                    </td>
                    <td
                      style={{
                        padding: '0.45rem 0.75rem',
                        color: CATEGORY_COLORS[row.category] || CATEGORY_COLORS.unknown,
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.license || '—'}
                    </td>
                    <td style={{ padding: '0.45rem 0.75rem' }}>
                      <CategoryBadge category={row.category} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
