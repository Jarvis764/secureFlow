/**
 * @fileoverview REST API v1 routes for external integrations.
 *
 * Mounted at /api/v1 in server.js.
 *
 * Authentication:
 *   All routes require a valid API key supplied in the `X-API-Key` header.
 *
 * Rate limiting:
 *   Limits are enforced per API key and scale with the key's tier:
 *     free       — 60 requests / hour
 *     pro        — 600 requests / hour
 *     enterprise — 6 000 requests / hour
 *
 * Routes:
 *   POST /scan — Accept { packageJson, lockfile } as a JSON body, run the
 *                vulnerability scan pipeline, and return the results.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { parseLockfile } from '../services/dependencyParser.js';
import { scanVulnerabilities } from '../services/vulnScanner.js';
import { calculateDependencyRisk, calculateOverallRisk } from '../services/riskScorer.js';
import Scan from '../models/Scan.js';
import Dependency from '../models/Dependency.js';

const router = Router();

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

/**
 * Coarse IP-based rate limiter applied before API key authentication.
 * Prevents unauthenticated enumeration / brute-force of the endpoint.
 * After authentication, per-key tier limits are enforced by apiRateLimiter.
 */
const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

// ---------------------------------------------------------------------------
// Per-tier rate limiters
// ---------------------------------------------------------------------------

/** Requests per hour for each tier. */
const TIER_LIMITS = {
  free: 60,
  pro: 600,
  enterprise: 6000,
};

/**
 * Express-rate-limit instance with a custom key generator that buckets
 * requests by API key ID + tier rather than by IP address.
 *
 * The `max` value is overridden per-request using the handler trick below
 * because express-rate-limit v6+ allows a function for `max`.
 */
const apiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  /**
   * Dynamically resolve the limit based on the tier embedded in the key.
   *
   * @param {import('express').Request} req
   * @returns {number}
   */
  max: (req) => {
    const tier = req.apiKey?.tier || 'free';
    return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  },
  /**
   * Key requests by the API key document ID (not by IP) so each key has its
   * own independent counter regardless of where the request originates.
   *
   * @param {import('express').Request} req
   * @returns {string}
   */
  keyGenerator: (req) => req.apiKey?._id?.toString() ?? req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Rate limit exceeded. Please reduce your request frequency or upgrade your plan.' },
  skip: (req) => !req.apiKey,  // apiKeyAuth runs first; skip if somehow absent
});

// ---------------------------------------------------------------------------
// POST /api/v1/scan
// ---------------------------------------------------------------------------

/**
 * Run a vulnerability scan on a set of package files supplied as JSON.
 *
 * Request body:
 * ```json
 * {
 *   "packageJson": "<raw package.json content as a string>",
 *   "lockfile":    "<raw package-lock.json content as a string>"
 * }
 * ```
 *
 * Response (201):
 * ```json
 * {
 *   "scanId":    "...",
 *   "riskScore": 42.5,
 *   "summary": {
 *     "critical": 0, "high": 2, "medium": 5, "low": 3, "total": 10
 *   }
 * }
 * ```
 *
 * Errors:
 *   400 — missing or invalid body fields
 *   401 — missing or invalid API key
 *   429 — rate limit exceeded
 *   500 — internal pipeline error
 */
router.post('/scan', ipLimiter, apiKeyAuth, apiRateLimiter, async (req, res, next) => {
  try {
    const { packageJson, lockfile } = req.body || {};

    if (!packageJson || typeof packageJson !== 'string') {
      return res.status(400).json({ error: '"packageJson" is required and must be a string.' });
    }
    if (!lockfile || typeof lockfile !== 'string') {
      return res.status(400).json({ error: '"lockfile" is required and must be a string.' });
    }

    // --- Run pipeline ---

    // 1. Parse lockfile
    const { projectName, directCount, transitiveCount, dependencies } = await parseLockfile(
      packageJson,
      lockfile
    );

    // 2. Scan vulnerabilities
    const scannedDeps = await scanVulnerabilities(dependencies);

    // 3. Per-dependency risk scores
    const scoredDeps = scannedDeps.map((dep) => ({
      ...dep,
      riskScore: calculateDependencyRisk(dep),
    }));

    // 4. Overall risk
    const { overallRisk, summary } = calculateOverallRisk(scoredDeps);

    // 5. Persist to MongoDB (source = 'api' for external API scans)
    const scan = await Scan.create({
      projectName,
      source: 'api',
      totalDependencies: dependencies.length,
      directDependencies: directCount,
      transitiveDependencies: transitiveCount,
      vulnerabilityCount: summary,
      riskScore: overallRisk,
      status: 'complete',
    });

    if (scoredDeps.length > 0) {
      await Dependency.insertMany(
        scoredDeps.map((dep) => ({
          scanId: scan._id,
          name: dep.name,
          version: dep.version,
          depth: dep.depth,
          isDevDependency: dep.isDevDependency || false,
          parent: dep.parent || undefined,
          vulnerabilities: dep.vulnerabilities || [],
          riskScore: dep.riskScore || 0,
        }))
      );
    }

    console.log(
      `[externalApiRoutes] API scan complete: scanId=${scan._id}, riskScore=${overallRisk}, key=${req.apiKey.name}`
    );

    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;

    res.status(201).json({
      scanId: scan._id.toString(),
      riskScore: overallRisk,
      summary,
      scanUrl: `${serverUrl}/scans/${scan._id}`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
