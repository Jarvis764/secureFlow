import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import EcosystemBadge from './EcosystemBadge';

/** Non-npm ecosystem filenames and their ecosystems */
const MANIFEST_FILES = {
  'requirements.txt': 'PyPI',
  'pipfile.lock': 'PyPI',
  'poetry.lock': 'PyPI',
  'pom.xml': 'Maven',
  'build.gradle': 'Maven',
  'build.gradle.kts': 'Maven',
  'go.mod': 'Go',
  'go.sum': 'Go',
  'cargo.lock': 'crates.io',
  'gemfile.lock': 'RubyGems',
};

/** Optional meta-files that can accompany a manifest */
const META_FILES = {
  'go.mod': 'go.sum',
  'go.sum': 'go.mod',
  'pyproject.toml': 'PyPI',
};

function detectFileRole(file) {
  const lower = file.name.toLowerCase();
  if (MANIFEST_FILES[lower]) return { role: 'manifest', ecosystem: MANIFEST_FILES[lower] };
  if (META_FILES[lower]) return { role: 'meta', ecosystem: null };
  return { role: null, ecosystem: null };
}

/**
 * UniversalDropzone — Drag-and-drop upload zone for non-npm ecosystem files.
 *
 * @param {object}   props
 * @param {Function} props.onUpload   - Called with (manifestFile, metaFile?).
 * @param {boolean}  [props.isLoading] - Shows spinner and disables input when true.
 */
export default function UniversalDropzone({ onUpload, isLoading = false }) {
  const [manifestFile, setManifestFile] = useState(null);
  const [metaFile, setMetaFile] = useState(null);
  const [detectedEcosystem, setDetectedEcosystem] = useState(null);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted) => {
    setError('');
    for (const file of accepted) {
      const { role, ecosystem } = detectFileRole(file);
      if (role === 'manifest') {
        setManifestFile(file);
        setDetectedEcosystem(ecosystem);
      } else if (role === 'meta') {
        setMetaFile(file);
      } else {
        setError(`Unrecognized file: "${file.name}". Please upload a supported ecosystem manifest file.`);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt', '.lock', '.mod', '.sum', '.toml'],
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
      'application/octet-stream': ['.lock', '.gradle', '.kts'],
    },
    disabled: isLoading,
    multiple: true,
  });

  function handleScan() {
    if (!manifestFile) {
      setError('Please provide a manifest file (e.g. requirements.txt, go.mod, Cargo.lock).');
      return;
    }
    onUpload?.(manifestFile, metaFile || undefined);
  }

  function removeManifest() {
    setManifestFile(null);
    setDetectedEcosystem(null);
    setError('');
  }

  function removeMeta() {
    setMetaFile(null);
    setError('');
  }

  const borderColor = isDragActive
    ? 'var(--accent-cyan)'
    : manifestFile
      ? 'var(--severity-low)'
      : 'var(--border-color)';

  const glow = isDragActive
    ? '0 0 20px rgba(0, 240, 255, 0.2)'
    : manifestFile
      ? '0 0 12px rgba(34, 197, 94, 0.12)'
      : 'none';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${borderColor}`,
          borderRadius: '10px',
          padding: '1.25rem 1rem',
          textAlign: 'center',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 0.25s ease',
          background: isDragActive ? 'rgba(0, 240, 255, 0.03)' : 'transparent',
          boxShadow: glow,
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        <input {...getInputProps()} />

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <svg width="24" height="24" viewBox="0 0 40 40" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent-cyan)" strokeWidth="3" strokeDasharray="60 40" />
            </svg>
            <span style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>Uploading…</span>
          </div>
        ) : (
          <>
            <p style={{ color: isDragActive ? 'var(--accent-cyan)' : 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem' }}>
              {isDragActive ? 'Drop file here' : 'Drop ecosystem file here'}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
              requirements.txt · Pipfile.lock · poetry.lock · pom.xml · build.gradle · go.mod · Cargo.lock · Gemfile.lock
            </p>
          </>
        )}
      </div>

      {/* Selected files */}
      <AnimatePresence>
        {(manifestFile || metaFile) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
          >
            {manifestFile && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                background: 'rgba(34, 197, 94, 0.07)',
                border: '1px solid rgba(34, 197, 94, 0.18)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--severity-low)', fontFamily: 'var(--font-mono)' }}>
                    {manifestFile.name}
                  </span>
                  {detectedEcosystem && <EcosystemBadge ecosystem={detectedEcosystem} size="sm" />}
                </div>
                <button
                  onClick={removeManifest}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0 0.2rem', lineHeight: 1 }}
                  aria-label="Remove manifest file"
                >✕</button>
              </div>
            )}
            {metaFile && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                background: 'rgba(0, 212, 255, 0.05)',
                border: '1px solid rgba(0, 212, 255, 0.12)',
              }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {metaFile.name} <span style={{ fontSize: '0.72rem' }}>(meta)</span>
                </span>
                <button
                  onClick={removeMeta}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0 0.2rem', lineHeight: 1 }}
                  aria-label="Remove meta file"
                >✕</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p style={{ color: 'var(--severity-critical)', fontSize: '0.78rem', margin: 0 }}>{error}</p>
      )}

      <button
        onClick={handleScan}
        disabled={!manifestFile || isLoading}
        style={{
          padding: '0.5rem 1.25rem',
          background: manifestFile && !isLoading ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.06)',
          color: manifestFile && !isLoading ? '#0a0e1a' : 'var(--text-secondary)',
          border: 'none',
          borderRadius: '7px',
          fontWeight: 700,
          fontSize: '0.85rem',
          cursor: manifestFile && !isLoading ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          width: '100%',
        }}
      >
        {isLoading ? 'Scanning…' : 'Scan Ecosystem File'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
