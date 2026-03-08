/**
 * @fileoverview Webhook routes for inbound GitHub App events.
 *
 * Mounted at /webhooks in server.js.
 *
 * Routes:
 *   POST /webhooks/github — Receive and process GitHub App webhook events.
 *
 * Security:
 *   Every request is authenticated by verifying the HMAC-SHA256 signature in
 *   the `X-Hub-Signature-256` header against the raw request body using the
 *   GITHUB_WEBHOOK_SECRET environment variable.  Requests with an invalid or
 *   missing signature are rejected with 401 before any payload parsing occurs.
 *
 * Note:
 *   This route must be mounted *before* the global `express.json()` middleware
 *   (or use `express.raw()` exclusively for this path) so that the raw body
 *   bytes are available for signature verification.  See server.js for details.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyWebhookSignature, handleWebhook } from '../services/githubAppService.js';

const router = Router();

/**
 * Rate limiter for inbound GitHub webhooks.
 * GitHub will retry failed deliveries, so we use a generous limit per IP
 * while still protecting against flooding.
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests, please try again later.' },
});

// ---------------------------------------------------------------------------
// POST /webhooks/github
// ---------------------------------------------------------------------------

/**
 * Receive a GitHub App webhook.
 *
 * Headers expected:
 *   X-GitHub-Event       — Event name (e.g. 'pull_request', 'ping').
 *   X-Hub-Signature-256  — HMAC-SHA256 of the raw body, prefixed with 'sha256='.
 *   X-GitHub-Delivery    — Unique delivery UUID (logged for traceability).
 */
router.post(
  '/github',
  webhookLimiter,
  // Raw body is already attached by the `express.raw()` middleware applied
  // exclusively to this path in server.js (req.body is a Buffer here).
  async (req, res) => {
    const signature  = req.headers['x-hub-signature-256'];
    const event      = req.headers['x-github-event'];
    const deliveryId = req.headers['x-github-delivery'] || '(unknown)';
    const secret     = process.env.GITHUB_WEBHOOK_SECRET;

    // 1. Verify HMAC signature.
    if (!secret) {
      console.error('[webhookRoutes] GITHUB_WEBHOOK_SECRET is not set — rejecting webhook.');
      return res.status(500).json({ error: 'Webhook secret not configured.' });
    }

    if (!verifyWebhookSignature(req.body, signature, secret)) {
      console.warn(`[webhookRoutes] Invalid signature for delivery ${deliveryId}.`);
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    // 2. Parse JSON payload (body is a raw Buffer at this point).
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Malformed JSON payload.' });
    }

    // 3. Acknowledge quickly — GitHub expects a 2xx within 10 s.
    res.status(202).json({ received: true });

    // 4. Process asynchronously so we don't hold the connection open.
    setImmediate(async () => {
      try {
        const result = await handleWebhook(event, payload);
        console.log(`[webhookRoutes] delivery=${deliveryId} event=${event} — ${result.message}`);
      } catch (err) {
        console.error(`[webhookRoutes] Unhandled error processing delivery ${deliveryId}:`, err);
      }
    });
  }
);

export default router;
