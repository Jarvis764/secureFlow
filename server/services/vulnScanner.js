/**
 * @fileoverview Scans dependencies for known vulnerabilities using the OSV.dev API,
 * with a MongoDB-backed 24-hour cache to reduce external API calls.
 */

import fetch from 'node-fetch';
import VulnCache from '../models/VulnCache.js';

/** OSV batch query endpoint. */
const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';

/** Maximum number of packages to include in a single OSV request. */
const OSV_BATCH_SIZE = 1000;

/** Cache TTL in milliseconds (24 hours). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Extracts the highest CVSS numeric score from an OSV vulnerability object.
 * Falls back to 5 if no score is available.
 * @param {Object} vuln - A single OSV vulnerability entry.
 * @returns {number}
 */
export function extractCvssScore(vuln) {
  try {
    // OSV severity[].score is a CVSS *vector* string (e.g. "CVSS:3.1/AV:N/..."), not a number.
    // Numeric scores are found in database_specific fields provided by individual databases.

    // 1. Top-level database_specific (e.g. GitHub Security Advisories)
    const topLevel = vuln.database_specific?.cvss_score ?? vuln.database_specific?.cvssScore;
    if (typeof topLevel === 'number') return topLevel;

    // 2. Per-affected entry database_specific / ecosystem_specific
    for (const affected of vuln.affected || []) {
      const score =
        affected.database_specific?.cvss_score ??
        affected.database_specific?.cvssScore ??
        affected.ecosystem_specific?.cvss_score;
      if (typeof score === 'number') return score;
    }

    // 3. Infer approximate score from the CVSS severity category when present
    const severityLabel = (vuln.database_specific?.severity || '').toUpperCase();
    if (severityLabel === 'CRITICAL') return 9.5;
    if (severityLabel === 'HIGH') return 8.0;
    if (severityLabel === 'MODERATE' || severityLabel === 'MEDIUM') return 5.5;
    if (severityLabel === 'LOW') return 2.0;
  } catch (_) {
    // Ignore parse errors
  }
  return 5; // Default CVSS score when unavailable
}

/**
 * Maps a numeric CVSS score to a severity label.
 * @param {number} score
 * @returns {'critical'|'high'|'medium'|'low'}
 */
export function mapCvssToSeverity(score) {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

/**
 * Extracts the first fixed version from an OSV vulnerability's affected ranges.
 * @param {Object} vuln - A single OSV vulnerability entry.
 * @returns {string|null}
 */
export function extractFixedVersion(vuln) {
  try {
    for (const affected of vuln.affected || []) {
      for (const range of affected.ranges || []) {
        for (const event of range.events || []) {
          if (event.fixed) return event.fixed;
        }
      }
    }
  } catch (_) {
    // Ignore
  }
  return null;
}

/**
 * Transforms a raw OSV vulnerability object into the project's internal format.
 * @param {Object} vuln - Raw OSV vulnerability object.
 * @returns {{id: string, summary: string, severity: string, cvssScore: number, fixedVersion: string|null, references: string[]}}
 */
function transformVuln(vuln) {
  const cvssScore = extractCvssScore(vuln);
  return {
    id: vuln.id || 'UNKNOWN',
    summary: vuln.summary || vuln.details || '',
    severity: mapCvssToSeverity(cvssScore),
    cvssScore,
    fixedVersion: extractFixedVersion(vuln),
    references: (vuln.references || []).map((r) => (typeof r === 'string' ? r : r.url)).filter(Boolean),
  };
}

/**
 * Looks up cached vulnerability results from MongoDB.
 * Returns a map of `name@version` → cached vulnerabilities array (or undefined if not cached).
 * @param {Array<{name: string, version: string}>} packages
 * @returns {Promise<Map<string, Array>>}
 */
async function loadFromCache(packages) {
  const cacheMap = new Map();
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);

  const keys = packages.map((p) => ({ packageName: p.name, packageVersion: p.version }));
  const cached = await VulnCache.find({
    $or: keys.map((k) => ({ packageName: k.packageName, packageVersion: k.packageVersion })),
    cachedAt: { $gte: cutoff },
  }).lean();

  for (const entry of cached) {
    cacheMap.set(`${entry.packageName}@${entry.packageVersion}`, entry.vulnerabilities || []);
  }
  return cacheMap;
}

/**
 * Saves vulnerability results to MongoDB cache.
 * @param {Array<{name: string, version: string}>} packages
 * @param {Array<Array>} vulnsPerPackage - Parallel array of vulnerability arrays.
 */
async function saveToCache(packages, vulnsPerPackage) {
  const ops = packages.map((pkg, i) => ({
    updateOne: {
      filter: { packageName: pkg.name, packageVersion: pkg.version },
      update: {
        $set: {
          vulnerabilities: vulnsPerPackage[i],
          cachedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  if (ops.length > 0) {
    await VulnCache.bulkWrite(ops);
  }
}

/**
 * Queries the OSV batch API for a list of packages.
 * @param {Array<{name: string, version: string}>} packages
 * @returns {Promise<Array<Array>>} Parallel array of vulnerability arrays per package.
 */
async function queryOSV(packages) {
  const queries = packages.map((pkg) => ({
    package: { name: pkg.name, ecosystem: 'npm' },
    version: pkg.version,
  }));

  const response = await fetch(OSV_BATCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries }),
  });

  if (!response.ok) {
    throw new Error(`OSV API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const results = data.results || [];

  return results.map((result) => (result.vulns || []).map(transformVuln));
}

/**
 * Scans an array of dependencies for vulnerabilities.
 * Uses MongoDB cache (24-hour TTL) before falling back to the OSV batch API.
 *
 * @param {Array<{name: string, version: string}>} dependencies
 * @returns {Promise<Array<{name: string, version: string, vulnerabilities: Array}>>}
 */
export async function scanVulnerabilities(dependencies) {
  if (!dependencies || dependencies.length === 0) return [];

  // Deduplicate by name@version
  const uniqueMap = new Map();
  for (const dep of dependencies) {
    const key = `${dep.name}@${dep.version}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, dep);
  }
  const uniqueDeps = Array.from(uniqueMap.values());

  console.log(`[vulnScanner] Scanning ${uniqueDeps.length} unique packages…`);

  // --- Cache lookup ---
  let cacheMap;
  try {
    cacheMap = await loadFromCache(uniqueDeps);
  } catch (err) {
    console.warn('[vulnScanner] Cache read failed, skipping cache:', err.message);
    cacheMap = new Map();
  }

  const cached = [];
  const uncached = [];

  for (const dep of uniqueDeps) {
    const key = `${dep.name}@${dep.version}`;
    if (cacheMap.has(key)) {
      cached.push({ dep, vulns: cacheMap.get(key) });
    } else {
      uncached.push(dep);
    }
  }

  console.log(`[vulnScanner] Cache hits: ${cached.length}, OSV queries needed: ${uncached.length}`);

  // --- OSV batch query for uncached packages ---
  const osvResults = new Map();
  if (uncached.length > 0) {
    // Split into batches of OSV_BATCH_SIZE
    for (let i = 0; i < uncached.length; i += OSV_BATCH_SIZE) {
      const batch = uncached.slice(i, i + OSV_BATCH_SIZE);
      try {
        const batchVulns = await queryOSV(batch);
        for (let j = 0; j < batch.length; j++) {
          const key = `${batch[j].name}@${batch[j].version}`;
          osvResults.set(key, batchVulns[j] || []);
        }
      } catch (err) {
        console.error(`[vulnScanner] OSV query failed for batch starting at ${i}:`, err.message);
        // Mark batch packages as having no vulnerabilities
        for (const dep of batch) {
          osvResults.set(`${dep.name}@${dep.version}`, []);
        }
      }
    }

    // Persist new results to cache
    try {
      const pkgsToCache = uncached.filter((d) => osvResults.has(`${d.name}@${d.version}`));
      const vulnsToCache = pkgsToCache.map((d) => osvResults.get(`${d.name}@${d.version}`));
      await saveToCache(pkgsToCache, vulnsToCache);
    } catch (err) {
      console.warn('[vulnScanner] Failed to save results to cache:', err.message);
    }
  }

  // --- Build result: attach vulnerabilities to every original dependency ---
  const vulnsByKey = new Map();
  for (const { dep, vulns } of cached) {
    vulnsByKey.set(`${dep.name}@${dep.version}`, vulns);
  }
  for (const [key, vulns] of osvResults) {
    vulnsByKey.set(key, vulns);
  }

  return dependencies.map((dep) => ({
    ...dep,
    vulnerabilities: vulnsByKey.get(`${dep.name}@${dep.version}`) || [],
  }));
}
