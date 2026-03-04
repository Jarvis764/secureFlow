import React from 'react';

const shimmerStyle = {
  background: 'linear-gradient(90deg, var(--bg-secondary) 25%, rgba(0,240,255,0.05) 50%, var(--bg-secondary) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: '6px',
};

function CardSkeleton() {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      overflow: 'hidden',
    }}>
      <div style={{ ...shimmerStyle, height: '12px', width: '45%' }} />
      <div style={{ ...shimmerStyle, height: '36px', width: '60%' }} />
      <div style={{ ...shimmerStyle, height: '10px', width: '75%' }} />
    </div>
  );
}

function TextSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ ...shimmerStyle, height: '14px', width: '100%' }} />
      <div style={{ ...shimmerStyle, height: '14px', width: '88%' }} />
      <div style={{ ...shimmerStyle, height: '14px', width: '72%' }} />
    </div>
  );
}

function GaugeSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{
        ...shimmerStyle,
        width: '160px',
        height: '160px',
        borderRadius: '50%',
      }} />
    </div>
  );
}

/**
 * Shimmer loading placeholder.
 *
 * @param {object}  props
 * @param {'card'|'text'|'gauge'} [props.variant='card'] - Skeleton shape.
 * @param {number}  [props.count=1] - Number of skeletons to render.
 */
export default function LoadingSkeleton({ variant = 'card', count = 1 }) {
  const Component = variant === 'text'
    ? TextSkeleton
    : variant === 'gauge'
      ? GaugeSkeleton
      : CardSkeleton;

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </>
  );
}
