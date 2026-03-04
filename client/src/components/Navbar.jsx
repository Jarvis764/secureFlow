import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav style={{
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-color)',
      padding: '0 2rem',
      display: 'flex',
      alignItems: 'center',
      height: '60px',
      gap: '2rem',
    }}>
      <span style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>
        SecureFlow
      </span>
      <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Dashboard</Link>
      <Link to="/scan" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>New Scan</Link>
      <Link to="/history" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>History</Link>
    </nav>
  );
}
