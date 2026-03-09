/**
 * @fileoverview Parses package.json and package-lock.json into a flat dependency array.
 * Also exposes parseUniversalFile() for multi-ecosystem support.
 */

import { parseEcosystemFile } from './parsers/index.js';

/** Maximum recursion depth for transitive dependencies. */
const MAX_DEPTH = 5;

/** Version protocol prefixes that should be skipped (local paths, links). */
const SKIP_PROTOCOLS = ['file:', 'link:'];

/**
 * Returns true if the version string uses a protocol that should be skipped.
 * @param {string|undefined} version
 * @returns {boolean}
 */
function shouldSkip(version) {
  if (!version) return false;
  return SKIP_PROTOCOLS.some((p) => String(version).startsWith(p));
}

/**
 * Recursively processes a lockfile v1 `dependencies` map into a flat array.
 * @param {Object} depsMap - The `dependencies` object from the lockfile entry.
 * @param {Set<string>} devDepNames - Top-level dev-dependency names from package.json.
 * @param {string|null} parent - Name of the parent package, or null for root.
 * @param {number} depth - Current recursion depth (0 = direct dependency).
 * @param {Set<string>} visited - Already-processed `name@version` keys (cycle guard).
 * @param {Array<Object>} result - Accumulator array for flattened dependency objects.
 */
function parseLockV1Deps(depsMap, devDepNames, parent, depth, visited, result) {
  if (depth > MAX_DEPTH || !depsMap) return;

  for (const [name, entry] of Object.entries(depsMap)) {
    if (shouldSkip(entry.version)) continue;

    const key = `${name}@${entry.version}`;
    if (visited.has(key)) continue;
    visited.add(key);

    result.push({
      name,
      version: entry.version || 'unknown',
      depth,
      isDevDependency: devDepNames.has(name),
      parent: parent || null,
    });

    if (entry.dependencies) {
      parseLockV1Deps(entry.dependencies, devDepNames, name, depth + 1, visited, result);
    }
  }
}

/**
 * Processes a lockfile v2/v3 `packages` map into a flat array.
 * Package paths use the form `node_modules/foo` or `node_modules/foo/node_modules/bar`.
 * @param {Object} packages - The `packages` object from the lockfile.
 * @param {Set<string>} devDepNames - Top-level dev-dependency names from package.json.
 * @returns {Array<Object>}
 */
function parseLockV2Packages(packages, devDepNames) {
  const result = [];
  const visited = new Set();

  for (const [pkgPath, entry] of Object.entries(packages)) {
    // Skip the root package entry (empty string key).
    if (pkgPath === '') continue;
    // Skip linked packages.
    if (entry.link) continue;
    if (shouldSkip(entry.resolved)) continue;

    // Split by "node_modules/" to derive depth and name.
    // e.g. "node_modules/foo"               → segments ["", "foo"]            depth 0
    //      "node_modules/foo/node_modules/bar" → segments ["", "foo/", "bar"]  depth 1
    const segments = pkgPath.split('node_modules/');
    const name = segments[segments.length - 1];
    const depth = segments.length - 2; // number of nested node_modules levels

    if (depth > MAX_DEPTH) continue;

    const version = entry.version || 'unknown';
    // Deduplicate by name@version — the same package appearing at multiple nesting
    // paths (hoisted vs. nested) should be included only once in the flat array.
    const key = `${name}@${version}`;
    if (visited.has(key)) continue;
    visited.add(key);

    // Parent is the package immediately containing this one (for nested entries).
    let parent = null;
    if (segments.length > 2) {
      // e.g. "node_modules/foo/node_modules/bar" → parent is "foo"
      const parentSegment = segments[segments.length - 2];
      parent = parentSegment.replace(/\/$/, '').split('/').pop() || null;
    }

    result.push({
      name,
      version,
      depth,
      isDevDependency: devDepNames.has(name),
      parent,
    });
  }

  return result;
}

/**
 * Parses a package.json string and a package-lock.json string into a flat
 * dependency array, supporting lockfileVersion 1, 2, and 3.
 *
 * @param {string} packageJsonStr - Raw content of package.json.
 * @param {string} lockfileStr - Raw content of package-lock.json.
 * @returns {Promise<{
 *   projectName: string,
 *   directCount: number,
 *   transitiveCount: number,
 *   dependencies: Array<{name: string, version: string, depth: number, isDevDependency: boolean, parent: string|null}>
 * }>}
 */
export async function parseLockfile(packageJsonStr, lockfileStr) {
  let packageJson;
  let lockfile;

  try {
    packageJson = JSON.parse(packageJsonStr);
  } catch (err) {
    throw new Error(`Failed to parse package.json: ${err.message}`);
  }

  try {
    lockfile = JSON.parse(lockfileStr);
  } catch (err) {
    throw new Error(`Failed to parse package-lock.json: ${err.message}`);
  }

  const projectName = packageJson.name || 'unknown-project';
  const devDepNames = new Set(Object.keys(packageJson.devDependencies || {}));

  let dependencies = [];
  const lockfileVersion = lockfile.lockfileVersion || 1;

  if (lockfileVersion >= 2 && lockfile.packages) {
    // Lockfile v2 / v3 — uses the flat "packages" map.
    dependencies = parseLockV2Packages(lockfile.packages, devDepNames);
  } else if (lockfile.dependencies) {
    // Lockfile v1 — uses the nested "dependencies" map.
    const visited = new Set();
    parseLockV1Deps(lockfile.dependencies, devDepNames, null, 0, visited, dependencies);
  }

  const directCount = dependencies.filter((d) => d.depth === 0).length;
  const transitiveCount = dependencies.filter((d) => d.depth > 0).length;

  console.log(
    `[dependencyParser] Parsed "${projectName}": ${directCount} direct, ${transitiveCount} transitive dependencies.`
  );

  return { projectName, directCount, transitiveCount, dependencies };
}

/**
 * Parses any supported ecosystem manifest or lockfile using the parser registry.
 * Automatically detects the ecosystem from the filename.
 *
 * Supported file types:
 *   npm: package-lock.json (requires metaContent=package.json)
 *   PyPI: requirements.txt, Pipfile.lock, poetry.lock
 *   Maven: pom.xml, build.gradle, build.gradle.kts
 *   Go: go.mod, go.sum
 *   Rust: Cargo.lock
 *   Ruby: Gemfile.lock
 *
 * @param {string} filename     - Name of the primary file.
 * @param {string} content      - Raw content of the primary file.
 * @param {string} [metaContent] - Optional secondary file content (e.g. package.json for npm).
 * @returns {Promise<{
 *   projectName: string,
 *   directCount: number,
 *   transitiveCount: number,
 *   dependencies: Array<{name, version, depth, isDevDependency, parent, ecosystem}>,
 *   ecosystem: string
 * }>}
 */
export async function parseUniversalFile(filename, content, metaContent) {
  // Special-case npm: delegate to parseLockfile for backward compatibility
  const lower = (filename || '').toLowerCase().split('/').pop().split('\\').pop();
  if (lower === 'package-lock.json') {
    if (!metaContent) {
      throw new Error('package-lock.json requires a package.json (metaContent) to be provided.');
    }
    const result = await parseLockfile(metaContent, content);
    return { ...result, ecosystem: 'npm' };
  }

  return parseEcosystemFile(filename, content, metaContent);
}
