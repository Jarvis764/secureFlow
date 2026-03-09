import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

const LICENSE_FILTER_OPTIONS = ['All', 'Permissive', 'Copyleft', 'Unknown'];

function categoryColor(category) {
  if (category === 'permissive') return 'var(--severity-low)';
  if (category === 'copyleft') return 'var(--severity-medium)';
  return 'var(--text-secondary)';
}

function purl(name, version) {
  if (!name || !version) return '';
  const encodedName = name.startsWith('@')
    ? `pkg:npm/%40${encodeURIComponent(name.slice(1))}@${encodeURIComponent(version)}`
    : `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
  return encodedName;
}

/**
 * SbomPreviewPanel — Interactive SBOM viewer.
 *
 * Props:
 *   dependencies {Array} - Dependency objects with license/licenseCategory fields.
 *   scan         {object} - Scan document.
 */
export default function SbomPreviewPanel({ dependencies = [], scan }) {
  const [search, setSearch] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dependencies.filter((dep) => {
      const matchesSearch = !q || dep.name?.toLowerCase().includes(q);
      const matchesLicense =
        licenseFilter === 'All' ||
        (dep.licenseCategory || 'unknown').toLowerCase() === licenseFilter.toLowerCase();
      return matchesSearch && matchesLicense;
    });
  }, [dependencies, search, licenseFilter]);

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ marginTop: '1.5rem' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <h3
          style={{
            fontSize: '0.88rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          📋 SBOM Preview
          <span
            style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              fontWeight: 400,
            }}
          >
            {filtered.length} / {dependencies.length} packages
          </span>
        </h3>
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '0.85rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search packages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px',
            background: 'rgba(17,24,39,0.7)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            padding: '0.4rem 0.75rem',
            fontSize: '0.82rem',
            outline: 'none',
          }}
        />
        <select
          value={licenseFilter}
          onChange={(e) => setLicenseFilter(e.target.value)}
          style={{
            background: 'rgba(17,24,39,0.7)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            padding: '0.4rem 0.75rem',
            fontSize: '0.82rem',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {LICENSE_FILTER_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div
        style={{
          overflowX: 'auto',
          maxHeight: '360px',
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
            minWidth: '560px',
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
              {['Package Name', 'Version', 'License', 'Category', 'PURL'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    borderBottom: '1px solid var(--border-color)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: '1.5rem',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                  }}
                >
                  No packages match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((dep, i) => {
                const category = dep.licenseCategory || 'unknown';
                const purlStr = purl(dep.name, dep.version);
                return (
                  <tr
                    key={dep._id || `${dep.name}@${dep.version}`}
                    style={{
                      background:
                        i % 2 === 0 ? 'rgba(17,24,39,0.3)' : 'rgba(17,24,39,0.5)',
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
                      {dep.name}
                    </td>
                    <td
                      style={{
                        padding: '0.45rem 0.75rem',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dep.version}
                    </td>
                    <td
                      style={{
                        padding: '0.45rem 0.75rem',
                        color: categoryColor(category),
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dep.license || '—'}
                    </td>
                    <td style={{ padding: '0.45rem 0.75rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.1rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: `${categoryColor(category)}22`,
                          color: categoryColor(category),
                          textTransform: 'capitalize',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {category}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.45rem 0.75rem',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.73rem',
                        maxWidth: '260px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={purlStr}
                    >
                      {purlStr || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
