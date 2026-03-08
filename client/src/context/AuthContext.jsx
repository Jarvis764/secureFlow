/**
 * @fileoverview Global authentication context for SecureFlow.
 *
 * Provides:
 *  - `user`   — { id, email, role } | null
 *  - `org`    — { id, name, slug, plan } | null
 *  - `loading` — true while the initial /me check is in flight
 *  - `login(email, password)`      — authenticate and populate context
 *  - `register(email, password, orgName)` — register and populate context
 *  - `logout()`                    — clear cookies and reset context
 *
 * Tokens are stored exclusively in httpOnly cookies managed by the server.
 * The client never reads or stores the raw JWT strings.
 *
 * Usage:
 *   // Wrap the app:
 *   <AuthProvider><App /></AuthProvider>
 *
 *   // Inside any component:
 *   const { user, login, logout } = useAuth();
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [org, setOrg]         = useState(null);
  const [loading, setLoading] = useState(true);

  // On first mount, attempt to restore session from the httpOnly cookie.
  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data.user ?? null);
        setOrg(data.org  ?? null);
      })
      .catch(() => {
        // Cookie missing or expired — user is not authenticated; that's fine.
        setUser(null);
        setOrg(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Authenticate with email + password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<void>}
   */
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setUser(data.user ?? null);
    setOrg(data.org  ?? null);
  }, []);

  /**
   * Register a new account and create an organisation.
   * @param {string} email
   * @param {string} password
   * @param {string} orgName
   * @returns {Promise<void>}
   */
  const register = useCallback(async (email, password, orgName) => {
    const { data } = await api.post('/auth/register', { email, password, orgName });
    setUser(data.user ?? null);
    setOrg(data.org  ?? null);
  }, []);

  /**
   * Log out the current user — clears server-side cookies and resets context.
   * @returns {Promise<void>}
   */
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Swallow errors — we always want to clear local state.
    }
    setUser(null);
    setOrg(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Value
  // ---------------------------------------------------------------------------

  const value = { user, org, loading, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the current auth context.
 *
 * @returns {{ user: Object|null, org: Object|null, loading: boolean, login: Function, register: Function, logout: Function }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}

export default AuthContext;
