/**
 * @fileoverview License analysis service for dependency packages.
 *
 * Fetches license data from the npm registry, categorizes SPDX identifiers,
 * detects license conflicts, and generates compliance reports.
 *
 * Uses node-fetch v2 for HTTP requests and a simple in-memory Map for caching
 * (no external packages required).
 */

import fetch from 'node-fetch';

// ---------------------------------------------------------------------------
// In-memory cache with 1-hour TTL
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const licenseCache = new Map(); // key -> { license, category, fetchedAt }

// ---------------------------------------------------------------------------
// License category definitions
// ---------------------------------------------------------------------------

const PERMISSIVE_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Unlicense',
  '0BSD',
  'CC0-1.0',
  'Zlib',
  'BlueOak-1.0.0',
]);

const COPYLEFT_LICENSES = new Set([
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'MPL-2.0',
  'EPL-1.0',
  'EPL-2.0',
  'EUPL-1.1',
  'EUPL-1.2',
  'CPAL-1.0',
  'OSL-3.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
]);

// ---------------------------------------------------------------------------
// categorizeLicense
// ---------------------------------------------------------------------------

/**
 * Categorize an SPDX license identifier.
 *
 * @param {string} licenseId
 * @returns {'permissive'|'copyleft'|'unknown'}
 */
export function categorizeLicense(licenseId) {
  if (!licenseId) return 'unknown';
  const id = licenseId.trim();
  if (PERMISSIVE_LICENSES.has(id)) return 'permissive';
  if (COPYLEFT_LICENSES.has(id)) return 'copyleft';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// fetchLicenseData
// ---------------------------------------------------------------------------

/**
 * Fetch license information for a single npm package.
 *
 * Results are cached for 1 hour. Returns { license, category } where
 * license is the SPDX identifier string and category is one of
 * 'permissive' | 'copyleft' | 'unknown'.
 *
 * @param {string} packageName
 * @returns {Promise<{ license: string, category: string }>}
 */
export async function fetchLicenseData(packageName) {
  const cached = licenseCache.get(packageName);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { license: cached.license, category: cached.category };
  }

  try {
    const encodedName = packageName.startsWith('@')
      ? `@${encodeURIComponent(packageName.slice(1))}`
      : encodeURIComponent(packageName);

    const response = await fetch(`https://registry.npmjs.org/${encodedName}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const result = { license: '', category: 'unknown', fetchedAt: Date.now() };
      licenseCache.set(packageName, result);
      return { license: result.license, category: result.category };
    }

    const data = await response.json();
    let licenseId = '';

    // npm registry stores license as string or as { type: '...' } object
    const rawLicense = data.license;
    if (typeof rawLicense === 'string') {
      licenseId = rawLicense;
    } else if (rawLicense && typeof rawLicense === 'object') {
      licenseId = rawLicense.type || rawLicense.name || '';
    }

    // Fall back to latest version's license field
    if (!licenseId) {
      const latestVersion = data['dist-tags']?.latest;
      if (latestVersion) {
        const versionData = data.versions?.[latestVersion];
        const vl = versionData?.license;
        if (typeof vl === 'string') licenseId = vl;
        else if (vl && typeof vl === 'object') licenseId = vl.type || vl.name || '';
      }
    }

    const category = categorizeLicense(licenseId);
    const entry = { license: licenseId, category, fetchedAt: Date.now() };
    licenseCache.set(packageName, entry);
    return { license: licenseId, category };
  } catch (_err) {
    const result = { license: '', category: 'unknown', fetchedAt: Date.now() };
    licenseCache.set(packageName, result);
    return { license: result.license, category: result.category };
  }
}

// ---------------------------------------------------------------------------
// analyzeLicenses
// ---------------------------------------------------------------------------

/**
 * Enrich an array of dependencies with license and licenseCategory fields.
 *
 * Processes up to 5 packages in parallel to avoid hammering the npm API.
 *
 * @param {Array<object>} dependencies
 * @returns {Promise<Array<object>>} Enriched dependency array.
 */
export async function analyzeLicenses(dependencies) {
  const CONCURRENCY = 5;
  const results = new Array(dependencies.length);

  for (let i = 0; i < dependencies.length; i += CONCURRENCY) {
    const batch = dependencies.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (dep) => {
        const { license, category } = await fetchLicenseData(dep.name);
        return { ...dep, license, licenseCategory: category };
      })
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

/**
 * Detect license conflicts between project license and dependency licenses.
 *
 * A conflict is flagged when a dependency uses copyleft and the project is
 * permissive (e.g., MIT project + GPL dependency).
 *
 * @param {Array<object>} dependencies - Enriched with license/licenseCategory.
 * @param {string} projectLicense - SPDX identifier (e.g., 'MIT').
 * @returns {Array<{ dependency: string, dependencyLicense: string, projectLicense: string, severity: string, message: string }>}
 */
export function detectConflicts(dependencies, projectLicense = 'MIT') {
  const projectCategory = categorizeLicense(projectLicense);
  const conflicts = [];

  for (const dep of dependencies) {
    const depCategory = dep.licenseCategory || categorizeLicense(dep.license);

    if (projectCategory === 'permissive' && depCategory === 'copyleft') {
      conflicts.push({
        dependency: `${dep.name}@${dep.version}`,
        dependencyLicense: dep.license || 'unknown',
        projectLicense,
        severity: 'error',
        message: `Copyleft license "${dep.license}" in ${dep.name} may be incompatible with permissive project license "${projectLicense}".`,
      });
    } else if (projectCategory === 'permissive' && depCategory === 'unknown' && dep.license) {
      conflicts.push({
        dependency: `${dep.name}@${dep.version}`,
        dependencyLicense: dep.license || 'unknown',
        projectLicense,
        severity: 'warning',
        message: `License "${dep.license}" in ${dep.name} is unrecognized and may require manual review.`,
      });
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// generateComplianceReport
// ---------------------------------------------------------------------------

/**
 * Generate a full license compliance report for all dependencies.
 *
 * @param {Array<object>} dependencies - Already enriched with license/licenseCategory.
 * @param {string} projectLicense - SPDX identifier.
 * @returns {{ summary: object, conflicts: Array, licenses: Array }}
 */
export function generateComplianceReport(dependencies, projectLicense = 'MIT') {
  let permissive = 0;
  let copyleft = 0;
  let unknown = 0;

  const licenses = dependencies.map((dep) => {
    const category = dep.licenseCategory || categorizeLicense(dep.license);
    if (category === 'permissive') permissive++;
    else if (category === 'copyleft') copyleft++;
    else unknown++;

    return {
      name: dep.name,
      version: dep.version,
      license: dep.license || '',
      category,
    };
  });

  const conflicts = detectConflicts(dependencies, projectLicense);

  return {
    summary: {
      total: dependencies.length,
      permissive,
      copyleft,
      unknown,
    },
    conflicts,
    licenses,
  };
}
