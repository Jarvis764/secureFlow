import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';

const PACKAGE_NAMES   = ['package.json'];
const LOCKFILE_NAMES  = ['package-lock.json', 'yarn.lock'];

function classifyFile(file) {
  if (PACKAGE_NAMES.includes(file.name))  return 'packageJson';
  if (LOCKFILE_NAMES.includes(file.name)) return 'lockfile';
  return null;
}

/**
 * Drag-and-drop upload zone for package.json + package-lock.json.
 *
 * @param {object}   props
 * @param {Function} props.onUpload   - Called with (packageJsonFile, lockfileFile).
 * @param {boolean}  [props.isLoading] - Shows spinner and disables input when true.
 */
export default function FileDropzone({ onUpload, isLoading = false }) {
  const [files, setFiles] = useState({ packageJson: null, lockfile: null });
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted) => {
    setError('');
    const next = { ...files };
    for (const file of accepted) {
      const type = classifyFile(file);
      if (type) next[type] = file;
    }
    setFiles(next);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/json': ['.json'] },
    disabled: isLoading,
    multiple: true,
  });

  const bothPresent = !!files.packageJson && !!files.lockfile;

  function handleScan() {
    if (!files.packageJson || !files.lockfile) {
      setError('Please provide both package.json and package-lock.json.');
      return;
    }
    onUpload?.(files.packageJson, files.lockfile);
  }

  function removeFile(type) {
    setFiles((prev) => ({ ...prev, [type]: null }));
    setError('');
  }

  const borderColor = isDragActive
    ? 'var(--accent-cyan)'
    : bothPresent
      ? 'var(--severity-low)'
      : 'var(--border-color)';

  const glow = isDragActive
    ? '0 0 24px rgba(0, 240, 255, 0.25)'
    : bothPresent
      ? '0 0 16px rgba(34, 197, 94, 0.15)'
      : 'none';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${borderColor}`,
          borderRadius: '12px',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 0.25s ease',
          background: isDragActive ? 'rgba(0, 240, 255, 0.04)' : 'transparent',
          boxShadow: glow,
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        <input {...getInputProps()} />

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <svg
              width="40" height="40" viewBox="0 0 40 40"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent-cyan)" strokeWidth="3" strokeDasharray="60 40" />
            </svg>
            <span style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>Uploading…</span>
          </div>
        ) : (
          <>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 0.75rem' }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="17 8 12 3 7 8" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="3" x2="12" y2="15" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p style={{ color: isDragActive ? 'var(--accent-cyan)' : 'var(--text-primary)', fontWeight: 600, marginBottom: '0.25rem' }}>
              {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              or click to browse — accepts <code style={{ color: 'var(--accent-cyan)' }}>.json</code> files
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.4rem' }}>
              Required: <strong>package.json</strong> + <strong>package-lock.json</strong>
            </p>
          </>
        )}
      </div>

      {/* Selected files */}
      <AnimatePresence>
        {(files.packageJson || files.lockfile) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
          >
            {[
              { key: 'packageJson', label: 'package.json' },
              { key: 'lockfile',    label: 'package-lock.json' },
            ].map(({ key, label }) => {
              const file = files[key];
              return (
                <div key={key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  background: file ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.06)',
                  border: `1px solid ${file ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.15)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>{file ? '✅' : '⬜'}</span>
                    <span style={{ fontSize: '0.82rem', color: file ? 'var(--severity-low)' : 'var(--text-secondary)' }}>
                      {file ? file.name : label}
                    </span>
                  </div>
                  {file && (
                    <button
                      onClick={() => removeFile(key)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        fontSize: '0.9rem',
                        padding: '0 0.25rem',
                        lineHeight: 1,
                      }}
                      aria-label={`Remove ${label}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p style={{ color: 'var(--severity-critical)', fontSize: '0.82rem', margin: 0 }}>{error}</p>
      )}

      <button
        onClick={handleScan}
        disabled={!bothPresent || isLoading}
        style={{
          marginTop: '0.25rem',
          padding: '0.6rem 1.5rem',
          background: bothPresent && !isLoading ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
          color: bothPresent && !isLoading ? '#0a0e1a' : 'var(--text-secondary)',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '0.9rem',
          cursor: bothPresent && !isLoading ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          width: '100%',
        }}
      >
        {isLoading ? 'Scanning…' : 'Scan Files'}
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
