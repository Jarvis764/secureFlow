/**
 * @fileoverview Mongoose model for Organisations (tenants).
 *
 * An Organisation groups users and their scans under a common namespace.
 * The `slug` is a URL-safe, lower-kebab-case identifier derived from the
 * organisation name at creation time.
 */

import mongoose from 'mongoose';

/** Embedded member sub-document — tracks which role a user holds here. */
const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['admin', 'developer', 'viewer'],
      default: 'developer',
    },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    /** Human-readable display name, e.g. "Acme Corp". */
    name: { type: String, required: true, trim: true },

    /**
     * URL-safe lowercase slug, e.g. "acme-corp".
     * Auto-generated from `name` and must be unique across all organisations.
     */
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    /** The user who created the organisation — always has admin role. */
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    /**
     * Subscription tier.
     *  free       : 3 projects, community support
     *  pro        : unlimited projects, priority support
     *  team       : SSO + audit log
     *  enterprise : custom SLA + on-prem option
     */
    plan: {
      type: String,
      enum: ['free', 'pro', 'team', 'enterprise'],
      default: 'free',
    },

    /** All members of this organisation (including the owner). */
    members: { type: [memberSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Organization', organizationSchema);
