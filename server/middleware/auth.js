/**
 * @fileoverview Authentication & authorization middleware.
 *
 * verifyToken  — reads the access JWT from the `accessToken` httpOnly cookie,
 *                verifies it, and attaches `req.user` for downstream handlers.
 * requireRole  — factory that returns middleware enforcing a minimum role level.
 * requireOrg   — ensures the authenticated user belongs to an organisation.
 */

import jwt from 'jsonwebtoken';

// Role hierarchy: higher index = more permissions
const ROLE_LEVELS = { viewer: 0, developer: 1, admin: 2 };

// ---------------------------------------------------------------------------
// verifyToken
// ---------------------------------------------------------------------------

/**
 * Middleware that verifies the JWT access token stored in the `accessToken`
 * httpOnly cookie.  On success it populates `req.user` with the token payload:
 * `{ sub, email, role, organizationId }`.
 *
 * Returns 401 if the token is missing, expired, or invalid.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function verifyToken(req, res, next) {
  const token = req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

/**
 * Returns middleware that allows only users whose role is at least `minRole`.
 *
 * Usage:
 *   router.delete('/project/:id', verifyToken, requireRole('admin'), handler);
 *
 * @param {'viewer'|'developer'|'admin'} minRole
 * @returns {import('express').RequestHandler}
 */
export function requireRole(minRole) {
  return (req, res, next) => {
    const userLevel = ROLE_LEVELS[req.user?.role] ?? -1;
    const required  = ROLE_LEVELS[minRole]        ?? 999;

    if (userLevel < required) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// requireOrg
// ---------------------------------------------------------------------------

/**
 * Middleware that ensures the authenticated user is associated with an
 * organisation.  Must be used after `verifyToken`.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireOrg(req, res, next) {
  if (!req.user?.organizationId) {
    return res.status(403).json({ error: 'Organisation membership required.' });
  }
  next();
}
