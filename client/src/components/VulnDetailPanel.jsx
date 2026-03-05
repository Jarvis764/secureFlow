import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Severity colour palette ──────────────────────────────────────────────
const SEVERITY_COLORS = {
  critical: '#ff1744',
  high:     '#ff3b5c',
  medium:   '#ffb84d',
  low:      '#00d4ff',
};

function getSeverityColor(severity) {
  return SEVERITY_COLORS[severity?.toLowerCase()] || '#94a3b8';
}

function SeverityBadge({ severity }) {
  const color = getSeverityColor(severity);
  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      padding:        '0.15rem 0.5rem',
      background:     `${color}22`,
      color,
      border:         `1px solid ${color}`,
      borderRadius:   '4px',
      fontSize:       '0.68rem',
      fontWeight:     700,
      fontFamily:     'JetBrains Mono, monospace',
      textTransform:  'uppercase',
      letterSpacing:  '0.05em',
      flexShrink:     0,
    }}>
      {severity?.toUpperCase() || 'UNKNOWN'}
    </span>
  );
}

/**
 * Slide-in panel showing details for a selected dependency graph node.
 *
 * @param {object}   props
 * @param {object|null} props.node        – selected graph node datum
 * @param {object|null} props.dependency  – matching full Dependency document (with vulnerabilities array)
 * @param {Function} props.onClose
 */
export default function VulnDetailPanel({ node, dependency, onClose }) {
  const vulnerabilities = dependency?.vulnerabilities ?? [];

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          key={node.id}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          style={{
            position:         'absolute',
            top:              0,
            right:            0,
            width:            '340px',
            height:           '100%',
            background:       'rgba(11, 17, 32, 0.97)',
            backdropFilter:   'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            borderLeft:       '1px solid rgba(0, 212, 255, 0.15)',
            overflowY:        'auto',
            padding:          '1.25rem',
            zIndex:           20,
            boxShadow:        '-8px 0 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* ── Header ───────────────────────────────────────────────── */}
          <div style={{
            display:         'flex',
            justifyContent:  'space-between',
            alignItems:      'flex-start',
            marginBottom:    '1.1rem',
            gap:             '0.5rem',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                color:       '#00d4ff',
                fontFamily:  'JetBrains Mono, monospace',
                fontSize:    '0.92rem',
                fontWeight:  700,
                wordBreak:   'break-all',
              }}>
                {node.name}
              </div>
              {node.version && (
                <div style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: '0.15rem' }}>
                  v{node.version}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close detail panel"
              style={{
                flexShrink:   0,
                background:   'none',
                border:       '1px solid rgba(0, 212, 255, 0.2)',
                borderRadius: '6px',
                color:        '#94a3b8',
                padding:      '0.2rem 0.55rem',
                cursor:       'pointer',
                fontSize:     '0.85rem',
                lineHeight:   1,
              }}
            >
              ✕
            </button>
          </div>

          {/* ── Metric tiles ─────────────────────────────────────────── */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 '0.5rem',
            marginBottom:        '1rem',
          }}>
            {[
              { label: 'Risk Score',      value: node.riskScore      ?? 0, color: '#00d4ff' },
              { label: 'Depth',           value: node.depth          ?? 0, color: '#94a3b8' },
              { label: 'Dependents',      value: node.dependentCount ?? 0, color: '#94a3b8' },
              {
                label: 'Vulnerabilities',
                value: node.vulnCount ?? 0,
                color: (node.vulnCount ?? 0) > 0 ? '#ff3b5c' : '#22c55e',
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background:   'rgba(255, 255, 255, 0.03)',
                border:       '1px solid rgba(0, 212, 255, 0.08)',
                borderRadius: '8px',
                padding:      '0.55rem 0.7rem',
              }}>
                <div style={{
                  fontSize:      '0.65rem',
                  color:         '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom:  '0.2rem',
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize:    '1.15rem',
                  fontWeight:  700,
                  fontFamily:  'JetBrains Mono, monospace',
                  color,
                }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* ── Max severity badge ───────────────────────────────────── */}
          {node.maxSeverity && (
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Max Severity:</span>
              <SeverityBadge severity={node.maxSeverity} />
            </div>
          )}

          {/* ── Divider ───────────────────────────────────────────────── */}
          <div style={{ height: '1px', background: 'rgba(0, 212, 255, 0.1)', marginBottom: '1rem' }} />

          {/* ── Vulnerability list ────────────────────────────────────── */}
          {vulnerabilities.length === 0 ? (
            <div style={{
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              padding:        '2rem 1rem',
              gap:            '0.5rem',
            }}>
              <span style={{ fontSize: '1.6rem' }}>✅</span>
              <span style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 600 }}>
                No known vulnerabilities
              </span>
            </div>
          ) : (
            <>
              <div style={{
                fontSize:      '0.72rem',
                color:         '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom:  '0.65rem',
              }}>
                Vulnerabilities ({vulnerabilities.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {vulnerabilities.map((vuln, idx) => (
                  <div key={vuln.id || idx} style={{
                    background:   'rgba(255, 59, 92, 0.05)',
                    border:       '1px solid rgba(255, 59, 92, 0.18)',
                    borderRadius: '8px',
                    padding:      '0.7rem',
                  }}>
                    {/* ID + severity */}
                    <div style={{
                      display:         'flex',
                      justifyContent:  'space-between',
                      alignItems:      'flex-start',
                      gap:             '0.5rem',
                      marginBottom:    '0.35rem',
                    }}>
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize:   '0.7rem',
                        color:      '#94a3b8',
                        wordBreak:  'break-all',
                      }}>
                        {/* Display 1-based numbering as a user-facing fallback label */}
                        {vuln.id || `VULN-${idx + 1}`}
                      </span>
                      <SeverityBadge severity={vuln.severity} />
                    </div>

                    {/* Summary */}
                    {vuln.summary && (
                      <div style={{
                        color:         '#e2e8f0',
                        fontSize:      '0.78rem',
                        lineHeight:    1.55,
                        marginBottom:  '0.45rem',
                      }}>
                        {vuln.summary}
                      </div>
                    )}

                    {/* CVSS + fix */}
                    <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', fontSize: '0.72rem' }}>
                      {vuln.cvssScore != null && (
                        <span style={{ color: '#94a3b8' }}>
                          CVSS:{' '}
                          <span style={{
                            color:      '#ffb84d',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 600,
                          }}>
                            {Number(vuln.cvssScore).toFixed(1)}
                          </span>
                        </span>
                      )}
                      {vuln.fixedVersion && (
                        <span style={{ color: '#94a3b8' }}>
                          Fix:{' '}
                          <span style={{
                            color:      '#22c55e',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}>
                            {vuln.fixedVersion}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
