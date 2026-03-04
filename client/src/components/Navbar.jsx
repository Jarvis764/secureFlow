import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const navLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/scan', label: 'New Scan' },
  { to: '/history', label: 'History' },
];

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 2rem',
      background: 'rgba(10, 14, 26, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-color)',
      boxShadow: '0 2px 24px rgba(0, 0, 0, 0.4)',
    }}>
      {/* Logo */}
      <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z"
            fill="none"
            stroke="var(--accent-cyan)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9 12l2 2 4-4"
            stroke="var(--accent-cyan)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{
          color: 'var(--accent-cyan)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: '1.2rem',
          letterSpacing: '0.05em',
          textShadow: '0 0 12px rgba(0, 240, 255, 0.4)',
        }}>
          SecureFlow
        </span>
      </Link>

      {/* Navigation links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        {navLinks.map(({ to, label }) => {
          const isActive = pathname === to || (to !== '/' && pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              style={{
                position: 'relative',
                display: 'inline-block',
                padding: '0.4rem 1rem',
                color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
                borderRadius: '6px',
                transition: 'color 0.2s ease',
                textShadow: isActive ? '0 0 8px rgba(0, 240, 255, 0.5)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {label}
              {isActive && (
                <span style={{
                  position: 'absolute',
                  bottom: 0,
                  left: '1rem',
                  right: '1rem',
                  height: '2px',
                  background: 'var(--accent-cyan)',
                  borderRadius: '1px',
                  boxShadow: '0 0 8px var(--accent-cyan)',
                }} />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
