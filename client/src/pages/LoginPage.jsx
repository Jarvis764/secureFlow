/**
 * @fileoverview Login page for SecureFlow.
 *
 * Renders a full-screen, centred card with email + password fields.
 * On success the user is redirected to the page they were trying to visit
 * (or the dashboard if no prior location).
 */

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

export default function LoginPage() {
  const { login }       = useAuth();
  const navigate        = useNavigate();
  const location        = useLocation();
  const from            = location.state?.from?.pathname ?? '/';

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'var(--bg-primary)',
    }}>
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="show"
        className="glass-card"
        style={{ width: '100%', maxWidth: '420px' }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 0.75rem' }}>
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
          <h1 style={{
            color: 'var(--accent-cyan)',
            fontFamily: 'var(--font-mono)',
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}>
            SecureFlow
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Sign in to your account
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--severity-critical)',
            borderRadius: '8px',
            color: 'var(--severity-critical)',
            fontSize: '0.875rem',
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle} htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '0.65rem', fontSize: '1rem', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Footer link */}
        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--accent-cyan)' }}>Create one →</Link>
        </p>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared micro-styles
// ---------------------------------------------------------------------------

const labelStyle = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
};

const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  transition: 'border-color 0.2s',
};
