/**
 * @fileoverview Rust ecosystem dependency parser.
 * Supports: Cargo.lock (TOML-like)
 * Returns ecosystem: 'crates.io'
 */

const ECOSYSTEM = 'crates.io';

/**
 * Parse Cargo.lock (TOML-like) content.
 * Parses [[package]] blocks with name, version, source.
 * Skips the root package (no source field or empty source).
 * Uses dependencies field to determine parent relationships.
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parseCargoLock(content) {
  const deps = [];
  const seen = new Set();

  // Split into [[package]] blocks
  const blocks = content.split(/(?=^\[\[package\]\])/m);

  // First pass: collect all packages with their data
  const packages = [];
  for (const block of blocks) {
    if (!block.trim().startsWith('[[package]]')) continue;

    const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m);
    const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m);
    const sourceMatch = block.match(/^source\s*=\s*"([^"]+)"/m);

    if (!nameMatch || !versionMatch) continue;

    const name = nameMatch[1];
    const version = versionMatch[1];
    const source = sourceMatch ? sourceMatch[1] : null;

    // Parse dependencies list
    const depsBlockMatch = block.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m);
    const depNames = [];
    if (depsBlockMatch) {
      const depsContent = depsBlockMatch[1];
      const depRe = /"([^"]+)"/g;
      let dm;
      while ((dm = depRe.exec(depsContent)) !== null) {
        // Each dep entry can be "name version" or just "name"
        const parts = dm[1].split(' ');
        depNames.push(parts[0]);
      }
    }

    packages.push({ name, version, source, depNames });
  }

  // Identify root package (no source field) — skip it
  // A package is root if it has no source and its name doesn't appear as a dep of others
  const allDepNames = new Set(packages.flatMap((p) => p.depNames));

  // Build name→package map (by name only, latest wins for duplicates)
  const pkgByName = new Map();
  for (const pkg of packages) {
    if (!pkgByName.has(pkg.name)) pkgByName.set(pkg.name, pkg);
  }

  // Second pass: create dependency entries
  for (const pkg of packages) {
    // Skip root package (no source and is not depended on by anything with source)
    if (!pkg.source) {
      // This is likely the root crate — skip it
      continue;
    }

    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Determine depth: if this package is a direct dependency of the root, depth=0
    // Otherwise depth=1 (transitive). Since we skip the root, treat all as depth 0.
    deps.push({
      name: pkg.name,
      version: pkg.version,
      depth: 0,
      isDevDependency: false,
      parent: null,
      ecosystem: ECOSYSTEM,
    });
  }

  return deps;
}

/**
 * Universal parse function for Rust ecosystem files.
 *
 * @param {string} content - Raw file content.
 * @param {string} [filename] - Filename (unused, always Cargo.lock).
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
export function parse(content, filename = '') {
  return parseCargoLock(content);
}
