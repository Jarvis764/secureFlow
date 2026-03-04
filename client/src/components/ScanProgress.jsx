import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const STEPS = [
  { key: 'parsing',   label: 'Parsing dependencies',        pct: 25 },
  { key: 'scanning',  label: 'Scanning for vulnerabilities', pct: 55 },
  { key: 'scoring',   label: 'Computing risk scores',        pct: 85 },
  { key: 'complete',  label: 'Finalizing results',            pct: 100 },
];

function statusToStep(status) {
  if (!status) return 0;
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

/**
 * Full-width animated progress bar showing scan pipeline stages.
 *
 * @param {object} props
 * @param {string} [props.status]  - One of 'parsing' | 'scanning' | 'scoring' | 'complete'.
 * @param {string} [props.message] - Optional override message.
 */
export default function ScanProgress({ status, message }) {
  const stepIndex   = statusToStep(status);
  const currentStep = STEPS[stepIndex];
  const pct         = currentStep?.pct ?? 0;

  // Animate the progress width
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDisplayPct(pct), 50);
    return () => clearTimeout(timer);
  }, [pct]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      {/* Progress bar */}
      <div style={{
        position: 'relative',
        height: '8px',
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          width: `${displayPct}%`,
          background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))',
          borderRadius: '4px',
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 0 12px rgba(0, 240, 255, 0.5)',
          animation: displayPct < 100 ? 'progressPulse 2s ease-in-out infinite' : 'none',
        }} />
      </div>

      {/* Status message */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', fontWeight: 500 }}>
          {message || currentStep?.label || 'Initialising…'}
        </span>
        <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {displayPct}%
        </span>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        {STEPS.map((step, i) => {
          const done    = i < stepIndex;
          const active  = i === stepIndex;
          return (
            <div key={step.key} style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.35rem',
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: `2px solid ${done || active ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.12)'}`,
                background: done
                  ? 'var(--accent-cyan)'
                  : active
                    ? 'rgba(0, 240, 255, 0.12)'
                    : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                boxShadow: active ? '0 0 10px rgba(0,240,255,0.35)' : 'none',
              }}>
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7l3.5 3.5 5.5-7" stroke="#0a0e1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {i + 1}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: '0.65rem',
                textAlign: 'center',
                color: done || active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 400,
                lineHeight: 1.3,
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes progressPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.7; }
        }
      `}</style>
    </motion.div>
  );
}
