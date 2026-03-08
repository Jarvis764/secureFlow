/**
 * @fileoverview Mongoose model for API keys used by external integrations.
 *
 * Keys are stored as SHA-256 hashes — the raw key is shown only once at
 * creation time and never stored in plaintext.
 *
 * Rate-limit tiers:
 *   free       — 60 requests / hour
 *   pro        — 600 requests / hour
 *   enterprise — 6 000 requests / hour
 */

import mongoose from 'mongoose';
import crypto from 'crypto';

const apiKeySchema = new mongoose.Schema(
  {
    /** SHA-256 hash of the raw API key (never store plaintext). */
    keyHash: { type: String, required: true, unique: true },

    /** Human-readable label for this key (e.g. "CI pipeline – staging"). */
    name: { type: String, required: true, trim: true },

    /** The organisation this key belongs to. */
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },

    /** The user who generated this key. */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    /**
     * Tier controls per-hour rate limits.
     *   free       → 60 req/hr
     *   pro        → 600 req/hr
     *   enterprise → 6 000 req/hr
     */
    tier: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },

    /** When false the key is treated as non-existent (soft-delete). */
    isActive: { type: Boolean, default: true },

    /** Timestamp of the most recent successful authenticated request. */
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Static helpers
// ---------------------------------------------------------------------------

/**
 * Returns the SHA-256 hex digest of a raw API key string.
 *
 * @param {string} rawKey
 * @returns {string}
 */
apiKeySchema.statics.hashKey = function (rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
};

/**
 * Looks up an active key document by its raw (unhashed) value.
 *
 * @param {string} rawKey
 * @returns {Promise<import('mongoose').Document|null>}
 */
apiKeySchema.statics.findByRawKey = function (rawKey) {
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
  return this.findOne({ keyHash: hash, isActive: true });
};

export default mongoose.model('ApiKey', apiKeySchema);
