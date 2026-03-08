/**
 * @fileoverview Mongoose model for application users.
 *
 * Each user belongs to one Organization and has a role that governs
 * what they can see and do in the UI (admin / developer / viewer).
 */

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    /** Unique, case-insensitive email address used for login. */
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    /** bcrypt hash of the user's password — never store plaintext. */
    passwordHash: { type: String, required: true },

    /**
     * Role controls access within the organisation:
     *  - admin     : full CRUD on projects + settings
     *  - developer : can create / trigger scans
     *  - viewer    : read-only access to results
     */
    role: {
      type: String,
      enum: ['admin', 'developer', 'viewer'],
      default: 'developer',
    },

    /** Reference to the Organisation this user belongs to (nullable for pending invites). */
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
