import React, { useState } from 'react';
import { motion } from 'framer-motion';

const GITHUB_RE = /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/.*)?$/;

/**
 * GitHub repository URL scanner input with validation.
 *
 * @param {object}   props
 * @param {Function} props.onSubmit   - Called with the validated repoUrl string.
 * @param {boolean}  [props.isLoading] - Disables input and shows spinner.
 */
export default function GitHubUrlInput({ onSubmit, isLoading = false }) {
  const [url, setUrl]       = useState('');
  const [error, setError]   = useState('');
  const [touched, setTouched] = useState(false);

  function validate(value) {
    if (!value.trim()) return 'Please enter a GitHub repository URL.';
    if (!GITHUB_RE.test(value.trim())) return 'Enter a valid GitHub URL (e.g. https://github.com/owner/repo).';
    return '';
  }

  function handleBlur() {
    setTouched(true);
    setError(validate(url));
  }

  function handleChange(e) {
    setUrl(e.target.value);
    if (touched) setError(validate(e.target.value));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validate(url);
    if (err) { setError(err); setTouched(true); return; }
    onSubmit?.(url.trim());
  }

  const hasError = !!error && touched;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        border: `1.5px solid ${hasError ? 'var(--severity-critical)' : 'var(--border-color)'}`,
        borderRadius: '10px',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: hasError
          ? '0 0 0 3px rgba(239,68,68,0.12)'
          : 'none',
      }}
        onFocus={() => {
          if (!hasError) {
            // handled via CSS pseudo-class via inline style won't work — skip
          }
        }}
      >
        {/* GitHub icon */}
        <div style={{
          padding: '0 0.75rem',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </div>

        <input
          type="url"
          value={url}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="https://github.com/owner/repo"
          disabled={isLoading}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.92rem',
            fontFamily: 'var(--font-mono)',
            padding: '0.7rem 0.5rem 0.7rem 0',
            opacity: isLoading ? 0.6 : 1,
          }}
        />

        {/* Submit button */}
        <motion.button
          type="submit"
          disabled={isLoading}
          whileTap={{ scale: 0.97 }}
          style={{
            flexShrink: 0,
            padding: '0.65rem 1.25rem',
            background: 'var(--accent-cyan)',
            color: '#0a0e1a',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            opacity: isLoading ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {isLoading ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="20 10" />
              </svg>
              Scanning…
            </>
          ) : (
            'Scan Repository'
          )}
        </motion.button>
      </div>

      {hasError && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ color: 'var(--severity-critical)', fontSize: '0.8rem', margin: 0 }}
        >
          {error}
        </motion.p>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </form>
  );
}
