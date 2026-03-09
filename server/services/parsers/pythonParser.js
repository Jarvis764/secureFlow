/**
 * @fileoverview Python ecosystem dependency parsers.
 * Supports: requirements.txt, Pipfile.lock, poetry.lock
 * All parsers return ecosystem: 'PyPI'
 */

const ECOSYSTEM = 'PyPI';

/**
 * Extracts version from a version specifier string.
 * For '==1.2.3' returns '1.2.3', for '>=1.2.3' returns '1.2.3', etc.
 * @param {string} specifier
 * @returns {string}
 */
function extractVersion(specifier) {
  const match = specifier.match(/^(?:==|>=|<=|~=|!=|>|<)\s*([^\s,;#]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Normalizes a Python package name (PEP 503: lowercase, replace [-_.] with -)
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Parse requirements.txt content.
 * Handles lines like: flask==2.3.0, requests>=2.28.0, numpy~=1.24
 * Skips: -r, -c, -e flags, comments, blank lines
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parseRequirementsTxt(content) {
  const deps = [];
  const seen = new Set();

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // Skip blank lines, comments, option flags (-r, -c, -e, etc.)
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;

    // Strip inline comment
    const stripped = line.split('#')[0].trim();
    if (!stripped) continue;

    // Handle environment markers (e.g. "requests>=2.0 ; python_version > '2.6'")
    const withoutMarker = stripped.split(';')[0].trim();

    // Match: name, optional extras, optional version specifiers
    // e.g. "flask==2.3.0", "requests [security] >= 2.0", "numpy~=1.24"
    const match = withoutMarker.match(
      /^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(?:\[[^\]]*\])?\s*((?:==|>=|<=|~=|!=|>|<)[^\s,]+)?/
    );

    if (!match) continue;

    const name = normalizeName(match[1]);
    const versionSpec = match[3] ? match[3].trim() : '';
    const version = versionSpec ? extractVersion(versionSpec) : 'unknown';

    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deps.push({ name, version, depth: 0, isDevDependency: false, parent: null, ecosystem: ECOSYSTEM });
  }

  return deps;
}

/**
 * Parse Pipfile.lock (JSON) content.
 * Extracts from "default" (prod) and "develop" (dev) sections.
 * Version format: "==x.y.z"
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parsePipfileLock(content) {
  let lockData;
  try {
    lockData = JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to parse Pipfile.lock: ${err.message}`);
  }

  const deps = [];
  const seen = new Set();

  function extractSection(section, isDev) {
    if (!section || typeof section !== 'object') return;
    for (const [pkgName, entry] of Object.entries(section)) {
      if (pkgName === '__pypi__') continue; // skip metadata
      const name = normalizeName(pkgName);
      const rawVersion = (entry && entry.version) ? entry.version : '';
      // Strip leading '==' from version string
      const version = rawVersion.startsWith('==') ? rawVersion.slice(2) : (rawVersion || 'unknown');
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deps.push({ name, version, depth: 0, isDevDependency: isDev, parent: null, ecosystem: ECOSYSTEM });
    }
  }

  extractSection(lockData.default, false);
  extractSection(lockData.develop, true);

  return deps;
}

/**
 * Parse poetry.lock (TOML-like) content.
 * Parses [[package]] blocks to extract name, version, category.
 * category "dev" or "development" → isDevDependency = true
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parsePoetryLock(content) {
  const deps = [];
  const seen = new Set();

  // Split into [[package]] blocks
  const blocks = content.split(/(?=^\[\[package\]\])/m);

  for (const block of blocks) {
    if (!block.trim().startsWith('[[package]]')) continue;

    const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m);
    const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m);
    const categoryMatch = block.match(/^category\s*=\s*"([^"]+)"/m);
    // Poetry 1.2+ uses groups instead of category
    const groupsMatch = block.match(/^groups\s*=\s*\[([^\]]+)\]/m);

    if (!nameMatch || !versionMatch) continue;

    const name = normalizeName(nameMatch[1]);
    const version = versionMatch[1];
    const category = categoryMatch ? categoryMatch[1].toLowerCase() : 'main';
    const groups = groupsMatch
      ? groupsMatch[1].replace(/"/g, '').split(',').map((g) => g.trim())
      : [];

    const isDev =
      category === 'dev' ||
      category === 'development' ||
      (groups.length > 0 && groups.every((g) => g !== 'main'));

    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deps.push({ name, version, depth: 0, isDevDependency: isDev, parent: null, ecosystem: ECOSYSTEM });
  }

  return deps;
}

/**
 * Universal parse function for Python ecosystem files.
 * Auto-detects the file type from the filename.
 *
 * @param {string} content - Raw file content.
 * @param {string} [filename] - Filename to auto-detect format.
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
export function parse(content, filename = '') {
  const lower = filename.toLowerCase();
  if (lower === 'pipfile.lock') return parsePipfileLock(content);
  if (lower === 'poetry.lock') return parsePoetryLock(content);
  // Default: treat as requirements.txt
  return parseRequirementsTxt(content);
}
