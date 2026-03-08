/**
 * @fileoverview Authentication routes.
 *
 * Mounted at /api/auth in server.js.
 *
 * Routes:
 *   POST  /register  — Create a user + organisation; set auth cookies.
 *   POST  /login     — Verify credentials; set auth cookies.
 *   POST  /refresh   — Issue new access token using the refresh cookie.
 *   POST  /logout    — Clear both auth cookies.
 *   GET   /me        — Return the currently authenticated user's profile.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import {
  register,
  login,
  refreshToken,
  signAccessToken,
  signRefreshToken,
  cookieOptions,
} from '../services/authService.js';
import { verifyToken } from '../middleware/auth.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';

const router = Router();

/** Strict rate limiter for auth mutation endpoints (register / login). */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// Access token cookie: 15 minutes
const ACCESS_MAX_AGE  = 15 * 60 * 1000;
// Refresh token cookie: 7 days
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Rate limiter for the /me profile read endpoint. */
const meLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

/**
 * Register a new user and create their organisation.
 *
 * Body: { email, password, orgName }
 * Sets httpOnly cookies: accessToken, refreshToken
 * Returns: { user: { id, email, role }, org: { id, name, slug, plan } }
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, orgName } = req.body;
    const { user, org } = await register(email, password, orgName);

    const access  = signAccessToken(user);
    const refresh = signRefreshToken(user);

    res
      .cookie('accessToken',  access,  cookieOptions(ACCESS_MAX_AGE))
      .cookie('refreshToken', refresh, cookieOptions(REFRESH_MAX_AGE))
      .status(201)
      .json({
        user: { id: user._id, email: user.email, role: user.role },
        org:  { id: org._id,  name: org.name,    slug: org.slug, plan: org.plan },
      });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

/**
 * Authenticate with email + password.
 *
 * Body: { email, password }
 * Sets httpOnly cookies: accessToken, refreshToken
 * Returns: { user: { id, email, role }, org: { id, name, slug, plan } | null }
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await login(email, password);

    const access  = signAccessToken(user);
    const refresh = signRefreshToken(user);

    // Fetch org details if the user belongs to one
    let org = null;
    if (user.organizationId) {
      const orgDoc = await Organization.findById(user.organizationId).lean();
      if (orgDoc) {
        org = { id: orgDoc._id, name: orgDoc.name, slug: orgDoc.slug, plan: orgDoc.plan };
      }
    }

    res
      .cookie('accessToken',  access,  cookieOptions(ACCESS_MAX_AGE))
      .cookie('refreshToken', refresh, cookieOptions(REFRESH_MAX_AGE))
      .json({ user: { id: user._id, email: user.email, role: user.role }, org });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

/**
 * Issue a new access token using the refresh token stored in the cookie.
 *
 * No body required — reads `refreshToken` cookie.
 * Sets httpOnly cookie: accessToken (new)
 * Returns: { ok: true }
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    const user  = await refreshToken(token);

    const access = signAccessToken(user);

    res
      .cookie('accessToken', access, cookieOptions(ACCESS_MAX_AGE))
      .json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

/**
 * Clear both auth cookies, effectively logging the user out.
 *
 * Returns: { ok: true }
 */
router.post('/logout', (req, res) => {
  const secureClear = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
  res
    .clearCookie('accessToken',  secureClear)
    .clearCookie('refreshToken', secureClear)
    .json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

/**
 * Return the currently authenticated user's profile and organisation.
 *
 * Requires valid accessToken cookie.
 * Returns: { user: { id, email, role }, org: { id, name, slug, plan } | null }
 */
router.get('/me', meLimiter, verifyToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).lean();
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    let org = null;
    if (user.organizationId) {
      const orgDoc = await Organization.findById(user.organizationId).lean();
      if (orgDoc) {
        org = { id: orgDoc._id, name: orgDoc.name, slug: orgDoc.slug, plan: orgDoc.plan };
      }
    }

    res.json({
      user: { id: user._id, email: user.email, role: user.role },
      org,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
