import React from 'react';

const ECOSYSTEM_CONFIG = {
  npm: {
    icon: '📦',
    color: '#CB3837',
    bg: 'rgba(203,56,55,0.12)',
    border: 'rgba(203,56,55,0.35)',
    label: 'npm',
  },
  PyPI: {
    icon: '🐍',
    color: '#3776AB',
    bg: 'rgba(55,118,171,0.12)',
    border: 'rgba(55,118,171,0.35)',
    label: 'PyPI',
  },
  Maven: {
    icon: '☕',
    color: '#C71A36',
    bg: 'rgba(199,26,54,0.12)',
    border: 'rgba(199,26,54,0.35)',
    label: 'Maven',
  },
  Go: {
    icon: '🔵',
    color: '#00ADD8',
    bg: 'rgba(0,173,216,0.12)',
    border: 'rgba(0,173,216,0.35)',
    label: 'Go',
  },
  'crates.io': {
    icon: '🦀',
    color: '#DEA584',
    bg: 'rgba(222,165,132,0.12)',
    border: 'rgba(222,165,132,0.35)',
    label: 'crates.io',
  },
  RubyGems: {
    icon: '💎',
    color: '#CC342D',
    bg: 'rgba(204,52,45,0.12)',
    border: 'rgba(204,52,45,0.35)',
    label: 'RubyGems',
  },
};

const DEFAULT_CONFIG = {
  icon: '📦',
  color: '#94a3b8',
  bg: 'rgba(148,163,184,0.10)',
  border: 'rgba(148,163,184,0.25)',
  label: 'unknown',
};

/**
 * EcosystemBadge — A small pill badge showing the package ecosystem.
 *
 * Props:
 *   ecosystem {string} - One of: 'npm', 'PyPI', 'Maven', 'Go', 'crates.io', 'RubyGems'
 *   size      {'sm'|'md'} - Badge size (default: 'sm')
 */
export default function EcosystemBadge({ ecosystem, size = 'sm' }) {
  const config = (ecosystem && ECOSYSTEM_CONFIG[ecosystem]) || DEFAULT_CONFIG;

  const fontSize = size === 'md' ? '0.8rem' : '0.7rem';
  const padding = size === 'md' ? '0.2rem 0.65rem' : '0.1rem 0.45rem';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding,
        borderRadius: '12px',
        fontSize,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
      title={config.label}
    >
      <span style={{ fontSize: size === 'md' ? '0.85rem' : '0.75rem' }}>{config.icon}</span>
      {config.label}
    </span>
  );
}

/**
 * Returns the color for a given ecosystem (for use in D3 or canvas rendering).
 * @param {string} ecosystem
 * @returns {string} hex color
 */
export function getEcosystemColor(ecosystem) {
  return (ECOSYSTEM_CONFIG[ecosystem] || DEFAULT_CONFIG).color;
}
