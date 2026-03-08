/**
 * @fileoverview Middleware that authenticates external API requests via the
 * `X-API-Key` HTTP header.
 *
 * On success it attaches the following to the request object:
 *   req.apiKey  — the ApiKey document (populated with organizationId)
 *   req.orgId   — shorthand for req.apiKey.organizationId
 *
 * On failure it returns 401 Unauthorized.
 *
 * Usage:
 *   import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
 *   router.post('/scan', apiKeyAuth, handler);
 */

import ApiKey from '../models/ApiKey.js';

/**
 * Express middleware that authenticates the request using an API key supplied
 * in the `X-API-Key` request header.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function apiKeyAuth(req, res, next) {
  const rawKey = req.headers['x-api-key'];

  if (!rawKey) {
    return res.status(401).json({ error: 'API key required. Supply it in the X-API-Key header.' });
  }

  try {
    const keyDoc = await ApiKey.findByRawKey(rawKey);

    if (!keyDoc) {
      return res.status(401).json({ error: 'Invalid or revoked API key.' });
    }

    // Attach key metadata for use by downstream handlers / rate limiters.
    req.apiKey = keyDoc;
    req.orgId  = keyDoc.organizationId;

    // Fire-and-forget update of lastUsedAt (no await — we don't block the request).
    ApiKey.updateOne({ _id: keyDoc._id }, { $set: { lastUsedAt: new Date() } }).catch((err) => {
      console.debug('[apiKeyAuth] Failed to update lastUsedAt:', err.message);
    });

    next();
  } catch (err) {
    next(err);
  }
}
