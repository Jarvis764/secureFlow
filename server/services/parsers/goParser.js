/**
 * @fileoverview Go ecosystem dependency parsers.
 * Supports: go.mod, go.sum
 * All parsers return ecosystem: 'Go'
 */

const ECOSYSTEM = 'Go';

/**
 * Parse go.mod content.
 * Extracts require block entries.
 * Handles single-line and multi-line require blocks.
 * Sets depth=1 for indirect dependencies (marked with "// indirect").
 * Skips replace and exclude blocks.
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parseGoMod(content) {
  const deps = [];
  const seen = new Set();

  // Remove replace blocks to avoid treating replacements as deps
  const withoutReplace = content.replace(/^replace\s.*$/gm, '').replace(/^replace\s+\([^)]*\)/gm, '');
  // Remove exclude blocks
  const withoutExclude = withoutReplace.replace(/^exclude\s.*$/gm, '').replace(/^exclude\s+\([^)]*\)/gm, '');

  // Match multi-line require blocks: require ( ... )
  const multiLineRe = /\brequire\s*\(([\s\S]*?)\)/g;
  let blockMatch;

  while ((blockMatch = multiLineRe.exec(withoutExclude)) !== null) {
    const block = blockMatch[1];
    processRequireBlock(block, deps, seen);
  }

  // Match single-line require: require github.com/pkg/errors v0.9.1
  const singleLineRe = /^require\s+([^\s(][^\s]+)\s+(v[^\s]+)(\s+\/\/\s*indirect)?/gm;
  let sm;
  while ((sm = singleLineRe.exec(withoutExclude)) !== null) {
    const name = sm[1];
    const version = sm[2];
    const indirect = !!sm[3];
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deps.push({
      name,
      version,
      depth: indirect ? 1 : 0,
      isDevDependency: false,
      parent: null,
      ecosystem: ECOSYSTEM,
    });
  }

  return deps;
}

/**
 * Process lines within a require block.
 * @param {string} block
 * @param {Array} deps
 * @param {Set} seen
 */
function processRequireBlock(block, deps, seen) {
  // Each line: "    github.com/pkg/errors v0.9.1 // indirect"
  const lineRe = /^\s*([^\s/][^\s]+)\s+(v[^\s]+)(\s+\/\/\s*indirect)?/gm;
  let lm;
  while ((lm = lineRe.exec(block)) !== null) {
    const name = lm[1];
    const version = lm[2];
    const indirect = !!lm[3];
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deps.push({
      name,
      version,
      depth: indirect ? 1 : 0,
      isDevDependency: false,
      parent: null,
      ecosystem: ECOSYSTEM,
    });
  }
}

/**
 * Parse go.sum content.
 * Extracts unique module@version pairs.
 * Each module has two lines: one for the zip hash, one for the go.mod hash.
 * Deduplicates to return each module@version once.
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parseGoSum(content) {
  const deps = [];
  const seen = new Set();

  // Each line: "github.com/pkg/errors v0.9.1 h1:..."
  // or:        "github.com/pkg/errors v0.9.1/go.mod h1:..."
  const lineRe = /^([^\s]+)\s+(v[^/\s]+)(?:\/go\.mod)?\s+h\d+:/gm;
  let lm;

  while ((lm = lineRe.exec(content)) !== null) {
    const name = lm[1];
    const version = lm[2];
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deps.push({
      name,
      version,
      depth: 0,
      isDevDependency: false,
      parent: null,
      ecosystem: ECOSYSTEM,
    });
  }

  return deps;
}

/**
 * Universal parse function for Go ecosystem files.
 * Auto-detects the file type from the filename.
 *
 * @param {string} content - Raw file content.
 * @param {string} [filename] - Filename to auto-detect format.
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
export function parse(content, filename = '') {
  const lower = filename.toLowerCase();
  if (lower === 'go.sum') return parseGoSum(content);
  // Default: go.mod
  return parseGoMod(content);
}
