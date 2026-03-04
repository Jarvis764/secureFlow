/**
 * @fileoverview Express routes for the vulnerability scanning pipeline.
 *
 * Mounted at /api/scans in server.js.
 *
 * Routes:
 *   POST   /upload   — Upload package.json + package-lock.json and run a scan.
 *   POST   /github   — Provide a GitHub repo URL and run a scan.
 *   GET    /         — Paginated scan history.
 *   GET    /:id      — Full details for a single scan.
 */

import { Router } from 'express';
import multer from 'multer';

import { parseLockfile } from '../services/dependencyParser.js';
import { scanVulnerabilities } from '../services/vulnScanner.js';
import { calculateDependencyRisk, calculateOverallRisk } from '../services/riskScorer.js';
import { fetchFromGitHub } from '../services/githubFetcher.js';
import { buildGraphData } from '../services/graphBuilder.js';
import Scan from '../models/Scan.js';
import Dependency from '../models/Dependency.js';

const router = Router();

/** Multer instance configured for in-memory storage (max 5 MB per file). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Shared pipeline helper
// ---------------------------------------------------------------------------

/**
 * Runs the full scanning pipeline for a given package.json + lockfile pair.
 *
 * Steps:
 *   1. Parse lockfile → flat dependency array.
 *   2. Scan each dependency for vulnerabilities (cache + OSV API).
 *   3. Calculate per-dependency risk scores.
 *   4. Calculate overall project risk.
 *   5. Persist a Scan document and all Dependency documents to MongoDB.
 *   6. Return { scanId, riskScore, summary }.
 *
 * @param {string} packageJsonStr - Raw package.json content.
 * @param {string} lockfileStr   - Raw package-lock.json content.
 * @param {'upload'|'github'} source
 * @param {string|null} repoUrl  - Only set for 'github' scans.
 * @returns {Promise<{ scanId: string, riskScore: number, summary: Object }>}
 */
async function runPipeline(packageJsonStr, lockfileStr, source, repoUrl = null) {
  // 1. Parse lockfile
  const { projectName, directCount, transitiveCount, dependencies } = await parseLockfile(
    packageJsonStr,
    lockfileStr
  );

  // 2. Scan vulnerabilities
  const scannedDeps = await scanVulnerabilities(dependencies);

  // 3. Per-dependency risk scores
  const scoredDeps = scannedDeps.map((dep) => ({
    ...dep,
    riskScore: calculateDependencyRisk(dep),
  }));

  // 4. Overall project risk
  const { overallRisk, summary } = calculateOverallRisk(scoredDeps);

  // 5. Persist to MongoDB
  const scan = await Scan.create({
    projectName,
    source,
    repoUrl: repoUrl || undefined,
    totalDependencies: dependencies.length,
    directDependencies: directCount,
    transitiveDependencies: transitiveCount,
    vulnerabilityCount: summary,
    riskScore: overallRisk,
    status: 'complete',
  });

  if (scoredDeps.length > 0) {
    const depDocs = scoredDeps.map((dep) => ({
      scanId: scan._id,
      name: dep.name,
      version: dep.version,
      depth: dep.depth,
      isDevDependency: dep.isDevDependency || false,
      parent: dep.parent || undefined,
      vulnerabilities: dep.vulnerabilities || [],
      riskScore: dep.riskScore || 0,
    }));
    await Dependency.insertMany(depDocs);
  }

  console.log(
    `[scanRoutes] Scan complete: scanId=${scan._id}, riskScore=${overallRisk}, total=${dependencies.length}`
  );

  return { scanId: scan._id.toString(), riskScore: overallRisk, summary };
}

// ---------------------------------------------------------------------------
// POST /upload
// ---------------------------------------------------------------------------

/**
 * Upload package.json and package-lock.json as multipart form fields and run a scan.
 *
 * Form fields:
 *   packageJson  — package.json file
 *   lockfile     — package-lock.json file
 */
router.post(
  '/upload',
  upload.fields([
    { name: 'packageJson', maxCount: 1 },
    { name: 'lockfile', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const files = req.files || {};

      if (!files.packageJson || !files.lockfile) {
        return res.status(400).json({ error: 'Both "packageJson" and "lockfile" files are required.' });
      }

      const packageJsonStr = files.packageJson[0].buffer.toString('utf8');
      const lockfileStr = files.lockfile[0].buffer.toString('utf8');

      const result = await runPipeline(packageJsonStr, lockfileStr, 'upload', null);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /github
// ---------------------------------------------------------------------------

/**
 * Fetch package.json and package-lock.json from a GitHub repository and run a scan.
 *
 * Request body:
 *   { "repoUrl": "https://github.com/owner/repo" }
 */
router.post('/github', async (req, res, next) => {
  try {
    const { repoUrl } = req.body || {};
    if (!repoUrl) {
      return res.status(400).json({ error: '"repoUrl" is required.' });
    }

    const { packageJson, lockfile } = await fetchFromGitHub(repoUrl);
    const result = await runPipeline(packageJson, lockfile, 'github', repoUrl);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET / — paginated scan history
// ---------------------------------------------------------------------------

/**
 * Returns paginated scan metadata.
 *
 * Query params:
 *   page  (default 1)
 *   limit (default 10)
 */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [scans, total] = await Promise.all([
      Scan.find({}, { projectName: 1, source: 1, repoUrl: 1, riskScore: 1, status: 1, vulnerabilityCount: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Scan.countDocuments(),
    ]);

    res.json({
      scans,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id — full scan details
// ---------------------------------------------------------------------------

/**
 * Returns full details for a single scan, including all dependency records
 * and a pre-built dependency graph.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const scan = await Scan.findById(req.params.id).lean();
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found.' });
    }

    const dependencies = await Dependency.find({ scanId: scan._id }).lean();
    const graphData = buildGraphData(dependencies);

    res.json({ scan, dependencies, graphData });
  } catch (err) {
    // Handle invalid ObjectId format gracefully
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid scan ID format.' });
    }
    next(err);
  }
});

export default router;
