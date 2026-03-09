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
import rateLimit from 'express-rate-limit';

import { parseLockfile, parseUniversalFile } from '../services/dependencyParser.js';
import { scanVulnerabilities } from '../services/vulnScanner.js';
import { calculateDependencyRisk, calculateOverallRisk } from '../services/riskScorer.js';
import { fetchFromGitHub } from '../services/githubFetcher.js';
import { buildGraphData } from '../services/graphBuilder.js';
import { generateSPDX, generateCycloneDX } from '../services/sbomGenerator.js';
import { analyzeLicenses, generateComplianceReport } from '../services/licenseAnalyzer.js';
import { detectEcosystem } from '../services/parsers/index.js';
import Scan from '../models/Scan.js';
import Dependency from '../models/Dependency.js';

const router = Router();

/** Rate limiter for read endpoints (scan history and details). */
const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/** Rate limiter for scan submission endpoints (upload / GitHub). */
const scanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many scan requests, please try again later.' },
});

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
 * @param {string} [ecosystem]   - Ecosystem identifier (default: 'npm').
 * @returns {Promise<{ scanId: string, riskScore: number, summary: Object }>}
 */
async function runPipeline(packageJsonStr, lockfileStr, source, repoUrl = null, ecosystem = 'npm') {
  // 1. Parse lockfile
  const { projectName, directCount, transitiveCount, dependencies } = await parseLockfile(
    packageJsonStr,
    lockfileStr
  );

  // Tag all dependencies with the ecosystem
  const taggedDeps = dependencies.map((d) => ({ ...d, ecosystem }));

  // 2. Scan vulnerabilities
  const scannedDeps = await scanVulnerabilities(taggedDeps);

  // 3. Per-dependency risk scores
  const scoredDeps = scannedDeps.map((dep) => ({
    ...dep,
    riskScore: calculateDependencyRisk(dep),
  }));

  // 3b. License analysis
  const licensedDeps = await analyzeLicenses(scoredDeps);

  // 4. Overall project risk
  const { overallRisk, summary } = calculateOverallRisk(licensedDeps);

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

  if (licensedDeps.length > 0) {
    const depDocs = licensedDeps.map((dep) => ({
      scanId: scan._id,
      name: dep.name,
      version: dep.version,
      depth: dep.depth,
      isDevDependency: dep.isDevDependency || false,
      parent: dep.parent || undefined,
      vulnerabilities: dep.vulnerabilities || [],
      riskScore: dep.riskScore || 0,
      license: dep.license || '',
      licenseCategory: dep.licenseCategory || '',
      ecosystem: dep.ecosystem || ecosystem,
    }));
    await Dependency.insertMany(depDocs);
  }

  console.log(
    `[scanRoutes] Scan complete: scanId=${scan._id}, riskScore=${overallRisk}, total=${dependencies.length}`
  );

  return { scanId: scan._id.toString(), riskScore: overallRisk, summary };
}

// ---------------------------------------------------------------------------
// Multi-module pipeline helper
// ---------------------------------------------------------------------------

/**
 * Parses direct/dev dependencies from a raw package.json string into stub dependency objects.
 * Used for modules that have no lockfile — these are returned as unscanned with no versions.
 *
 * @param {string} packageJsonStr
 * @param {string} modulePath
 * @returns {Array<{ name: string, version: string, depth: number, isDevDependency: boolean, parent: null, vulnerabilities: [], riskScore: number, modulePath: string }>}
 */
function parsePackageJsonStubs(packageJsonStr, modulePath) {
  let pkg;
  try {
    pkg = JSON.parse(packageJsonStr);
  } catch (_) {
    return [];
  }
  const stubs = [];
  for (const [name, ver] of Object.entries(pkg.dependencies || {})) {
    stubs.push({ name, version: String(ver), depth: 0, isDevDependency: false, parent: null, vulnerabilities: [], riskScore: 0, modulePath });
  }
  for (const [name, ver] of Object.entries(pkg.devDependencies || {})) {
    stubs.push({ name, version: String(ver), depth: 0, isDevDependency: true, parent: null, vulnerabilities: [], riskScore: 0, modulePath });
  }
  return stubs;
}

/**
 * Runs the scanning pipeline across multiple modules discovered from a GitHub repository.
 *
 * Steps per module:
 *   - With lockfile: parseLockfile → scanVulnerabilities → calculateDependencyRisk
 *   - Without lockfile: extract dependency stubs from package.json (unscanned)
 *
 * All module dependencies are merged, tagged with `modulePath`, combined risk is calculated,
 * and a single Scan + all Dependency documents are persisted.
 *
 * @param {Array<{ path: string, packageJson: string, lockfile: string|null, lockfileType: string|null }>} modules
 * @param {'github'} source
 * @param {string} repoUrl
 * @param {string} projectName
 * @returns {Promise<{ scanId: string, riskScore: number, summary: Object, moduleCount: number }>}
 */
async function runMultiModulePipeline(modules, source, repoUrl, projectName) {
  const allDeps = [];
  let totalDirect = 0;
  let totalTransitive = 0;
  const modulePaths = [];

  for (const mod of modules) {
    const modPath = mod.path;
    modulePaths.push(modPath);
    console.log(`[scanRoutes] Processing module "${modPath || 'root'}" (lockfile: ${mod.lockfileType || 'none'})…`);

    if (mod.lockfile) {
      try {
        const { directCount, transitiveCount, dependencies } = await parseLockfile(
          mod.packageJson,
          mod.lockfile
        );
        const scanned = await scanVulnerabilities(dependencies);
        const scored = scanned.map((dep) => ({
          ...dep,
          riskScore: calculateDependencyRisk(dep),
          modulePath: modPath,
        }));
        totalDirect += directCount;
        totalTransitive += transitiveCount;
        allDeps.push(...scored);
      } catch (err) {
        console.log(`[scanRoutes] Module "${modPath}" parse/scan error: ${err.message}. Falling back to stubs.`);
        const stubs = parsePackageJsonStubs(mod.packageJson, modPath);
        totalDirect += stubs.filter((d) => !d.isDevDependency).length;
        allDeps.push(...stubs);
      }
    } else {
      const stubs = parsePackageJsonStubs(mod.packageJson, modPath);
      totalDirect += stubs.filter((d) => !d.isDevDependency).length;
      allDeps.push(...stubs);
      console.log(`[scanRoutes] Module "${modPath}" has no lockfile; added ${stubs.length} unscanned stubs.`);
    }
  }

  const { overallRisk, summary } = calculateOverallRisk(allDeps);

  // License analysis for all collected deps
  const licensedAllDeps = await analyzeLicenses(allDeps);

  const scan = await Scan.create({
    projectName,
    source,
    repoUrl: repoUrl || undefined,
    totalDependencies: licensedAllDeps.length,
    directDependencies: totalDirect,
    transitiveDependencies: totalTransitive,
    vulnerabilityCount: summary,
    riskScore: overallRisk,
    status: 'complete',
  });

  if (licensedAllDeps.length > 0) {
    const depDocs = licensedAllDeps.map((dep) => ({
      scanId: scan._id,
      name: dep.name,
      version: dep.version,
      depth: dep.depth,
      isDevDependency: dep.isDevDependency || false,
      parent: dep.parent || undefined,
      vulnerabilities: dep.vulnerabilities || [],
      riskScore: dep.riskScore || 0,
      modulePath: dep.modulePath || '',
      license: dep.license || '',
      licenseCategory: dep.licenseCategory || '',
      ecosystem: dep.ecosystem || 'npm',
    }));
    await Dependency.insertMany(depDocs);
  }

  console.log(
    `[scanRoutes] Multi-module scan complete: scanId=${scan._id}, modules=${modules.length}, total=${licensedAllDeps.length}, riskScore=${overallRisk}`
  );

  return { scanId: scan._id.toString(), riskScore: overallRisk, summary, moduleCount: modules.length };
}

// ---------------------------------------------------------------------------
// POST /upload/universal — Universal multi-ecosystem file upload
// ---------------------------------------------------------------------------

/**
 * Upload any supported ecosystem manifest/lockfile and run a scan.
 *
 * Form fields:
 *   manifestFile — required primary file (e.g. requirements.txt, go.mod, Cargo.lock)
 *   metaFile     — optional secondary file (e.g. package.json for npm, go.mod alongside go.sum)
 *
 * Supported ecosystems: PyPI, Maven, Go, crates.io, RubyGems
 * (npm files are handled by the existing /upload endpoint)
 */
router.post(
  '/upload/universal',
  scanLimiter,
  upload.fields([
    { name: 'manifestFile', maxCount: 1 },
    { name: 'metaFile', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const files = req.files || {};

      if (!files.manifestFile || !files.manifestFile[0]) {
        return res.status(400).json({ error: '"manifestFile" is required.' });
      }

      const manifestFile = files.manifestFile[0];
      const metaFile = files.metaFile ? files.metaFile[0] : null;

      const manifestContent = manifestFile.buffer.toString('utf8');
      const metaContent = metaFile ? metaFile.buffer.toString('utf8') : undefined;
      const filename = manifestFile.originalname;

      // Detect ecosystem
      const detected = detectEcosystem(filename);
      if (!detected) {
        return res.status(400).json({
          error: `Unsupported file type: "${filename}". Supported files: requirements.txt, Pipfile.lock, poetry.lock, pom.xml, build.gradle, build.gradle.kts, go.mod, go.sum, Cargo.lock, Gemfile.lock`,
        });
      }

      if (detected.ecosystem === 'npm') {
        return res.status(400).json({
          error: 'For npm projects, use the standard /upload endpoint with package.json and package-lock.json.',
        });
      }

      // Parse the file(s)
      const { projectName, directCount, transitiveCount, dependencies, ecosystem } =
        await parseUniversalFile(filename, manifestContent, metaContent);

      // Run vulnerability scan
      const scannedDeps = await scanVulnerabilities(dependencies);

      // Per-dependency risk scores
      const scoredDeps = scannedDeps.map((dep) => ({
        ...dep,
        riskScore: calculateDependencyRisk(dep),
      }));

      // License analysis
      const licensedDeps = await analyzeLicenses(scoredDeps);

      // Overall project risk
      const { overallRisk, summary } = calculateOverallRisk(licensedDeps);

      // Persist to MongoDB
      const scan = await Scan.create({
        projectName,
        source: 'upload',
        totalDependencies: dependencies.length,
        directDependencies: directCount,
        transitiveDependencies: transitiveCount,
        vulnerabilityCount: summary,
        riskScore: overallRisk,
        status: 'complete',
      });

      if (licensedDeps.length > 0) {
        const depDocs = licensedDeps.map((dep) => ({
          scanId: scan._id,
          name: dep.name,
          version: dep.version,
          depth: dep.depth,
          isDevDependency: dep.isDevDependency || false,
          parent: dep.parent || undefined,
          vulnerabilities: dep.vulnerabilities || [],
          riskScore: dep.riskScore || 0,
          license: dep.license || '',
          licenseCategory: dep.licenseCategory || '',
          ecosystem: dep.ecosystem || ecosystem,
        }));
        await Dependency.insertMany(depDocs);
      }

      console.log(
        `[scanRoutes] Universal scan complete: scanId=${scan._id}, ecosystem=${ecosystem}, riskScore=${overallRisk}, total=${dependencies.length}`
      );

      res.status(201).json({
        scanId: scan._id.toString(),
        riskScore: overallRisk,
        summary,
        ecosystem,
      });
    } catch (err) {
      next(err);
    }
  }
);

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
  scanLimiter,
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
 * Fetch package.json and lockfiles from a GitHub repository and run a scan.
 *
 * Request body:
 *   { "repoUrl": "https://github.com/owner/repo" }
 */
router.post('/github', scanLimiter, async (req, res, next) => {
  try {
    const { repoUrl } = req.body || {};
    if (!repoUrl) {
      return res.status(400).json({ error: '"repoUrl" is required.' });
    }

    const { projectName, modules } = await fetchFromGitHub(repoUrl);
    const result = await runMultiModulePipeline(modules, 'github', repoUrl, projectName);
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
router.get('/', readLimiter, async (req, res, next) => {
  try {
    const parsedPage = parseInt(req.query.page, 10);
    const parsedLimit = parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 10;
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
router.get('/:id', readLimiter, async (req, res, next) => {
  try {
    const scan = await Scan.findById(req.params.id).lean();
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found.' });
    }

    const dependencies = await Dependency.find({ scanId: scan._id }).lean();
    const modulePaths = [...new Set(dependencies.map((d) => d.modulePath || ''))].sort();
    const graphData = buildGraphData(dependencies, modulePaths.length > 1 ? modulePaths : undefined);

    const licenseReport = generateComplianceReport(dependencies, 'MIT');

    res.json({ scan, dependencies, graphData, licenseReport });
  } catch (err) {
    // Handle invalid ObjectId format gracefully
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid scan ID format.' });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/sbom/spdx — SPDX 2.3 JSON SBOM download
// ---------------------------------------------------------------------------

router.get('/:id/sbom/spdx', readLimiter, async (req, res, next) => {
  try {
    const scan = await Scan.findById(req.params.id).lean();
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found.' });
    }

    const dependencies = await Dependency.find({ scanId: scan._id }).lean();
    const sbom = generateSPDX(scan, dependencies);

    const filename = `${(scan.projectName ?? 'sbom').replace(/\s+/g, '-')}.spdx.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(sbom);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid scan ID format.' });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/sbom/cyclonedx — CycloneDX 1.5 JSON or XML SBOM download
// ---------------------------------------------------------------------------

router.get('/:id/sbom/cyclonedx', readLimiter, async (req, res, next) => {
  try {
    const scan = await Scan.findById(req.params.id).lean();
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found.' });
    }

    const dependencies = await Dependency.find({ scanId: scan._id }).lean();
    const format = req.query.format === 'xml' ? 'xml' : 'json';
    const sbom = generateCycloneDX(scan, dependencies, format);
    const baseName = (scan.projectName ?? 'sbom').replace(/\s+/g, '-');

    if (format === 'xml') {
      const filename = `${baseName}.cdx.xml`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/xml');
      res.send(sbom);
    } else {
      const filename = `${baseName}.cdx.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(sbom);
    }
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid scan ID format.' });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/licenses — License compliance report
// ---------------------------------------------------------------------------

router.get('/:id/licenses', readLimiter, async (req, res, next) => {
  try {
    const scan = await Scan.findById(req.params.id).lean();
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found.' });
    }

    const dependencies = await Dependency.find({ scanId: scan._id }).lean();
    const projectLicense = 'MIT';
    const report = generateComplianceReport(dependencies, projectLicense);

    res.json(report);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid scan ID format.' });
    }
    next(err);
  }
});

export default router;
