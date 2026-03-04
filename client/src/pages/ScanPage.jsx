import React from 'react';

export default function ScanPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 60px)', padding: '2rem' }}>
      <div className="glass-card" style={{ textAlign: 'center', minWidth: '320px' }}>
        <h1 style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>New Scan</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Start a new vulnerability scan</p>
      </div>
    </div>
  );
}
