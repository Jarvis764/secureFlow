import React from 'react';
import { useParams } from 'react-router-dom';

export default function ScanResultPage() {
  const { id } = useParams();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 60px)', padding: '2rem' }}>
      <div className="glass-card" style={{ textAlign: 'center', minWidth: '320px' }}>
        <h1 style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>Scan Results</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Scan ID: {id}</p>
      </div>
    </div>
  );
}
