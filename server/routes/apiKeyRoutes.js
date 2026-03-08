/**
 * @fileoverview API key management routes.
 *
 * Mounted at /api/api-keys in server.js.
 *
 * All routes require an authenticated user (verifyToken) and organisation
 * membership (requireOrg).
 *
 * Routes:
 *   GET    /           — List all active API keys for the authenticated org.
 *   POST   /           — Generate a new API key; the raw key is returned once.
 *   DELETE /:id        — Revoke (soft-delete) an API key by its document ID.
 */

import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

import { verifyToken, requireOrg } from '../middleware/auth.js';
import ApiKey from '../models/ApiKey.js';

const router = Router();

/** Rate limiter for key management operations — applied before authentication. */
const keyMgmtLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// All routes in this file require rate limiting, authentication + org membership.
router.use(keyMgmtLimiter, verifyToken, requireOrg);

// ---------------------------------------------------------------------------
// GET /api/api-keys
// ---------------------------------------------------------------------------

/**
 * List all active API keys for the authenticated organisation.
 *
 * Returns key metadata only — the raw key value is never returned after
 * initial creation.
 */
router.get('/', async (req, res, next) => {
  try {
    const keys = await ApiKey.find(
      { organizationId: req.user.organizationId, isActive: true },
      { keyHash: 0 }   // never expose the hash
    )
      .sort({ createdAt: -1 })
      .lean();

    res.json({ keys });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/api-keys
// ---------------------------------------------------------------------------

/**
 * Generate a new API key for the authenticated organisation.
 *
 * Request body:
 *   { "name": "CI pipeline – production", "tier": "pro" }
 *
 * The `tier` field is optional and defaults to 'free'.
 *
 * Returns:
 *   { "key": "<raw-api-key>", "id": "<document-id>", "name": "...", "tier": "..." }
 *
 * ⚠ The raw key is shown **once** in this response and never stored.
 *    Store it securely immediately.
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, tier } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '"name" is required.' });
    }

    const validTiers = ['free', 'pro', 'enterprise'];
    const resolvedTier = validTiers.includes(tier) ? tier : 'free';

    // Generate a 32-byte (256-bit) cryptographically random key.
    // Prefix with "sf_" (SecureFlow) so the key is visually identifiable as
    // a SecureFlow credential in logs or secret scanners.
    const API_KEY_PREFIX = 'sf_';
    const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = ApiKey.hashKey(rawKey);

    const keyDoc = await ApiKey.create({
      keyHash,
      name: name.trim(),
      organizationId: req.user.organizationId,
      createdBy: req.user.sub,
      tier: resolvedTier,
    });

    res.status(201).json({
      key: rawKey,          // shown once — never stored in plaintext
      id: keyDoc._id,
      name: keyDoc.name,
      tier: keyDoc.tier,
      createdAt: keyDoc.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/api-keys/:id
// ---------------------------------------------------------------------------

/**
 * Revoke an API key by its document ID.
 *
 * Only the owning organisation can revoke a key.
 * Uses soft-delete: sets `isActive = false` rather than removing the document.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const keyDoc = await ApiKey.findOne({
      _id: id,
      organizationId: req.user.organizationId,
    });

    if (!keyDoc) {
      return res.status(404).json({ error: 'API key not found.' });
    }

    if (!keyDoc.isActive) {
      return res.status(409).json({ error: 'API key is already revoked.' });
    }

    keyDoc.isActive = false;
    await keyDoc.save();

    res.json({ ok: true, message: 'API key revoked.' });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid API key ID format.' });
    }
    next(err);
  }
});

export default router;
