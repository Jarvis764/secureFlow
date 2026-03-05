import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const VARIANT_STYLE = {
  success: { bg: 'rgba(34,197,94,0.12)',  border: 'var(--severity-low)',      color: 'var(--severity-low)',      icon: '✅' },
  error:   { bg: 'rgba(239,68,68,0.12)',  border: 'var(--severity-critical)', color: 'var(--severity-critical)', icon: '⚠️' },
  info:    { bg: 'rgba(0,240,255,0.10)',  border: 'var(--accent-cyan)',       color: 'var(--accent-cyan)',        icon: 'ℹ️' },
};

let _nextId = 0;

/**
 * Toast notification component. Rendered by ToastContainer.
 */
function Toast({ id, message, type = 'info', onRemove }) {
  const s = VARIANT_STYLE[type] ?? VARIANT_STYLE.info;

  return (
    <motion.div
      layout
      key={id}
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 60, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           '0.65rem',
        padding:       '0.85rem 1.2rem',
        background:    s.bg,
        border:        `1px solid ${s.border}`,
        borderRadius:  '10px',
        color:         s.color,
        fontWeight:    600,
        fontSize:      '0.88rem',
        maxWidth:      '360px',
        width:         '100%',
        backdropFilter:'blur(8px)',
        boxShadow:     '0 4px 20px rgba(0,0,0,0.4)',
        cursor:        'pointer',
        userSelect:    'none',
      }}
      onClick={() => onRemove(id)}
      role="alert"
    >
      <span style={{ fontSize: '1.05rem', flexShrink: 0 }}>{s.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <span style={{ opacity: 0.55, fontSize: '0.8rem', flexShrink: 0 }}>✕</span>
    </motion.div>
  );
}

/**
 * useToast — returns { showToast, ToastContainer }
 *
 * Usage:
 *   const { showToast, ToastContainer } = useToast();
 *   showToast('Upload failed', 'error');
 *   // Render <ToastContainer /> somewhere in your JSX tree.
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const remove = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++_nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    timers.current[id] = setTimeout(() => remove(id), duration);
    return id;
  }, [remove]);

  function ToastContainer() {
    return (
      <div style={{
        position:       'fixed',
        top:            '80px',
        right:          '1.5rem',
        zIndex:         500,
        display:        'flex',
        flexDirection:  'column',
        gap:            '0.6rem',
        alignItems:     'flex-end',
        pointerEvents:  'none',
      }}>
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <div key={t.id} style={{ pointerEvents: 'auto' }}>
              <Toast {...t} onRemove={remove} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return { showToast, ToastContainer };
}

export default Toast;
