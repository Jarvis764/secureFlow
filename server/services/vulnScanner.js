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
    // 1. Top-level database_specific (e.g. GitHub Security Advisories)
    const topLevel = vuln.database_specific?.cvss_score ?? vuln.database_specific?.cvssScore;
    if (typeof topLevel === 'number') return topLevel;

    // 2. Parse CVSS score from the top-level severity[] array (CVSS vector strings)
    //    e.g. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" → extract base score from vector
    for (const sev of vuln.severity || []) {
      const vector = sev.score || sev.vector || '';
      // Try to extract numeric score if the database provides one alongside the vector
      if (typeof sev.baseScore === 'number') return sev.baseScore;
      // Parse CVSS v3 vectors to approximate a base score from impact metrics
      if (vector.includes('CVSS:3')) {
        const parts = Object.fromEntries(vector.split('/').slice(1).map(p => p.split(':')));
        // Map confidentiality/integrity/availability impact to score
        const impactMap = { H: 3, M: 2, L: 1, N: 0 };
        const c = impactMap[parts.C] ?? 1;
        const i = impactMap[parts.I] ?? 1;
        const a = impactMap[parts.A] ?? 1;
        const av = parts.AV === 'N' ? 1.5 : parts.AV === 'A' ? 1.2 : 1;
        const ac = parts.AC === 'L' ? 1.2 : 1;
        const rawScore = ((c + i + a) / 9) * 10 * av * ac;
        const clampedScore = Math.min(Math.round(rawScore * 10) / 10, 10);
        if (clampedScore > 0) return clampedScore;
      }
      // Check severity type label from the severity entry itself
      const sevType = (sev.type || '').toUpperCase();
      if (sevType === 'CVSS_V3' || sevType === 'CVSS_V2') {
        // If we have a type but couldn't parse, try severity label fallback below
      }
    }

    // 3. Per-affected entry database_specific / ecosystem_specific
    for (const affected of vuln.affected || []) {
      const score =
        affected.database_specific?.cvss_score ??
        affected.database_specific?.cvssScore ??
        affected.ecosystem_specific?.cvss_score;
      if (typeof score === 'number') return score;

      // Check severity label in affected entries
      const affectedSeverity = (
        affected.database_specific?.severity ||
        affected.ecosystem_specific?.severity || ''
      ).toUpperCase();
      if (affectedSeverity === 'CRITICAL') return 9.5;
      if (affectedSeverity === 'HIGH') return 8.0;
      if (affectedSeverity === 'MODERATE' || affectedSeverity === 'MEDIUM') return 5.5;
      if (affectedSeverity === 'LOW') return 2.0;
    }

    // 4. Infer approximate score from the CVSS severity category when present
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
 * Returns a map of `name@version@ecosystem` → cached vulnerabilities array (or undefined if not cached).
 * @param {Array<{name: string, version: string, ecosystem?: string}>} packages
 * @returns {Promise<Map<string, Array>>}
 */
async function loadFromCache(packages) {
  const cacheMap = new Map();
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);

  const keys = packages.map((p) => ({
    packageName: p.name,
    packageVersion: p.version,
    ecosystem: p.ecosystem || 'npm',
  }));
  const cached = await VulnCache.find({
    $or: keys.map((k) => ({
      packageName: k.packageName,
      packageVersion: k.packageVersion,
      ecosystem: k.ecosystem,
    })),
    cachedAt: { $gte: cutoff },
  }).lean();

  for (const entry of cached) {
    const eco = entry.ecosystem || 'npm';
    cacheMap.set(`${entry.packageName}@${entry.packageVersion}@${eco}`, entry.vulnerabilities || []);
  }
  return cacheMap;
}

/**
 * Saves vulnerability results to MongoDB cache.
 * @param {Array<{name: string, version: string, ecosystem?: string}>} packages
 * @param {Array<Array>} vulnsPerPackage - Parallel array of vulnerability arrays.
 */
async function saveToCache(packages, vulnsPerPackage) {
  const ops = packages.map((pkg, i) => ({
    updateOne: {
      filter: {
        packageName: pkg.name,
        packageVersion: pkg.version,
        ecosystem: pkg.ecosystem || 'npm',
      },
      update: {
        $set: {
          vulnerabilities: vulnsPerPackage[i],
          cachedAt: new Date(),
          ecosystem: pkg.ecosystem || 'npm',
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
 * Fetches full vulnerability details from OSV for a single vuln ID.
 * @param {string} vulnId - e.g. "GHSA-29mw-wpgm-hmr9"
 * @returns {Promise<Object|null>} Full OSV vulnerability object, or null on error.
 */
async function fetchVulnDetails(vulnId) {
  try {
    const response = await fetch(`https://api.osv.dev/v1/vulns/${vulnId}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

/**
 * Fetches full details for multiple vulnerability IDs in parallel batches.
 * @param {string[]} vulnIds - Array of vulnerability IDs.
 * @param {number} [concurrency=10] - Max parallel requests.
 * @returns {Promise<Map<string, Object>>} Map of vulnId → full vuln object.
 */
async function fetchAllVulnDetails(vulnIds, concurrency = 10) {
  const detailsMap = new Map();
  for (let i = 0; i < vulnIds.length; i += concurrency) {
    const batch = vulnIds.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(id => fetchVulnDetails(id)));
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) detailsMap.set(batch[j], results[j]);
    }
  }
  console.log(`[vulnScanner] Fetched full details for ${detailsMap.size}/${vulnIds.length} vulnerabilities.`);
  return detailsMap;
}

/**
 * Queries the OSV batch API for a list of packages, then fetches full
 * vulnerability details to get accurate severity/CVSS data.
 * @param {Array<{name: string, version: string}>} packages
 * @returns {Promise<Array<Array>>} Parallel array of vulnerability arrays per package.
 */
async function queryOSV(packages) {
  const queries = packages.map((pkg) => ({
    package: { name: pkg.name, ecosystem: pkg.ecosystem || 'npm' },
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

  // Collect all unique vulnerability IDs from the batch response
  const allVulnIds = new Set();
  for (const result of results) {
    for (const vuln of result.vulns || []) {
      if (vuln.id) allVulnIds.add(vuln.id);
    }
  }

  // Fetch full details for each unique vulnerability (batch API returns minimal data)
  console.log(`[vulnScanner] Batch found ${allVulnIds.size} unique vulnerabilities, fetching full details…`);
  const detailsMap = await fetchAllVulnDetails([...allVulnIds]);

  // Map each package's vulns using full details (fall back to batch data if detail fetch failed)
  return results.map((result) =>
    (result.vulns || []).map((batchVuln) => {
      const fullVuln = detailsMap.get(batchVuln.id) || batchVuln;
      return transformVuln(fullVuln);
    })
  );
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

  // Deduplicate by name@version@ecosystem
  const uniqueMap = new Map();
  for (const dep of dependencies) {
    const key = `${dep.name}@${dep.version}@${dep.ecosystem || 'npm'}`;
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
    const key = `${dep.name}@${dep.version}@${dep.ecosystem || 'npm'}`;
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
          const key = `${batch[j].name}@${batch[j].version}@${batch[j].ecosystem || 'npm'}`;
          osvResults.set(key, batchVulns[j] || []);
        }
      } catch (err) {
        console.error(`[vulnScanner] OSV query failed for batch starting at ${i}:`, err.message);
        // Mark batch packages as having no vulnerabilities
        for (const dep of batch) {
          osvResults.set(`${dep.name}@${dep.version}@${dep.ecosystem || 'npm'}`, []);
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
    vulnsByKey.set(`${dep.name}@${dep.version}@${dep.ecosystem || 'npm'}`, vulns);
  }
  for (const [key, vulns] of osvResults) {
    vulnsByKey.set(key, vulns);
  }

  return dependencies.map((dep) => ({
    ...dep,
    vulnerabilities: vulnsByKey.get(`${dep.name}@${dep.version}@${dep.ecosystem || 'npm'}`) || [],
  }));
}
