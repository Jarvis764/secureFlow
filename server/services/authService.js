/**
 * @fileoverview Authentication service — registration, login, and token refresh.
 *
 * Tokens:
 *  • Access token  — short-lived (15 min) JWT sent back as a secure httpOnly cookie.
 *  • Refresh token — long-lived (7 days) JWT stored as a separate httpOnly cookie.
 *
 * Passwords are hashed with bcrypt (cost factor 12).
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Organization from '../models/Organization.js';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = '7d';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts an organisation name into a URL-safe slug.
 * e.g. "Acme Corp!" → "acme-corp"
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Signs a JWT access token containing `{ sub, email, role, organizationId }`.
 *
 * @param {Object} user - Mongoose User document.
 * @returns {string}
 */
export function signAccessToken(user) {
  return jwt.sign(
    {
      sub:            user._id.toString(),
      email:          user.email,
      role:           user.role,
      organizationId: user.organizationId?.toString() ?? null,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

/**
 * Signs a JWT refresh token containing only `{ sub }`.
 *
 * @param {Object} user - Mongoose User document.
 * @returns {string}
 */
export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );
}

/**
 * Builds the cookie options object shared by both token cookies.
 * Secure flag is set when NODE_ENV is production.
 *
 * @param {number} maxAgeMs - Cookie lifetime in milliseconds.
 * @returns {import('express').CookieOptions}
 */
export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   maxAgeMs,
    path:     '/',
  };
}

// ---------------------------------------------------------------------------
// Public service methods
// ---------------------------------------------------------------------------

/**
 * Registers a new user and creates a new Organisation for them.
 *
 * @param {string} email          - User email (must be unique).
 * @param {string} password       - Plain-text password (min 8 chars).
 * @param {string} orgName        - Display name for the new organisation.
 * @returns {Promise<{ user: Object, org: Object }>}
 * @throws {Error} If email already exists or password is too short.
 */
export async function register(email, password, orgName) {
  if (!email || !password || !orgName) {
    const err = new Error('email, password, and orgName are required.');
    err.statusCode = 400;
    throw err;
  }

  if (password.length < 8) {
    const err = new Error('Password must be at least 8 characters.');
    err.statusCode = 400;
    throw err;
  }

  // Check email uniqueness
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err = new Error('An account with that email already exists.');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Build a unique slug — append random 4-char hex suffix if base slug is taken
  let baseSlug = slugify(orgName) || 'org';
  let slug = baseSlug;
  if (await Organization.findOne({ slug })) {
    slug = `${baseSlug}-${Math.random().toString(16).slice(2, 6)}`;
    // Extremely unlikely second collision, but handle it
    while (await Organization.findOne({ slug })) {
      slug = `${baseSlug}-${Math.random().toString(16).slice(2, 6)}`;
    }
  }

  // Create user first (without org), then create org referencing user
  const user = await User.create({
    email,
    passwordHash,
    role: 'admin',
  });

  const org = await Organization.create({
    name:    orgName,
    slug,
    owner:   user._id,
    plan:    'free',
    members: [{ userId: user._id, role: 'admin' }],
  });

  // Back-fill the org reference on the user
  user.organizationId = org._id;
  await user.save();

  return { user, org };
}

/**
 * Authenticates a user with email + password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} The authenticated User document.
 * @throws {Error} If credentials are invalid.
 */
export async function login(email, password) {
  if (!email || !password) {
    const err = new Error('email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  return user;
}

/**
 * Validates a refresh token and returns the associated user.
 *
 * @param {string} token - Refresh JWT.
 * @returns {Promise<Object>} The User document.
 * @throws {Error} If token is invalid or user no longer exists.
 */
export async function refreshToken(token) {
  if (!token) {
    const err = new Error('Refresh token is required.');
    err.statusCode = 401;
    throw err;
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    const err = new Error('Invalid or expired refresh token.');
    err.statusCode = 401;
    throw err;
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    const err = new Error('User no longer exists.');
    err.statusCode = 401;
    throw err;
  }

  return user;
}
