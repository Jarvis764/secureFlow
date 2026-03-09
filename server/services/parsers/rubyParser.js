/**
 * @fileoverview Ruby ecosystem dependency parser.
 * Supports: Gemfile.lock
 * Returns ecosystem: 'RubyGems'
 */

const ECOSYSTEM = 'RubyGems';

/**
 * Parse Gemfile.lock content.
 * Parses the GEM section, extracts entries under specs:.
 * Indentation determines depth:
 *   4-space indent from line start = gem entry (depth 0)
 *   6-space indent from line start = child dependency entry (establishes parent)
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parseGemfileLock(content) {
  const deps = [];
  const seen = new Set();

  const lines = content.split('\n');

  let inGemSection = false;
  let inSpecs = false;
  let currentParent = null; // name of the gem at 4-space indent

  for (const line of lines) {
    // Detect section boundaries
    if (line.trim() === 'GEM') {
      inGemSection = true;
      inSpecs = false;
      continue;
    }

    // Exit GEM section when we hit another top-level section
    if (inGemSection && /^[A-Z]/.test(line) && line.trim() !== 'GEM') {
      inGemSection = false;
      inSpecs = false;
      currentParent = null;
      continue;
    }

    if (!inGemSection) continue;

    // Detect specs: subsection
    if (line.trim() === 'specs:') {
      inSpecs = true;
      continue;
    }

    if (!inSpecs) continue;

    // Blank line ends specs section
    if (line.trim() === '') {
      inSpecs = false;
      continue;
    }

    // Count leading spaces to determine indent level
    const leadingSpaces = line.match(/^( *)/)[1].length;

    // Extract name (version) pattern
    // e.g. "    actioncable (7.0.4)" or "      actionpack (~> 7.0.0)"
    const entryMatch = line.match(/^\s+([A-Za-z0-9_\-\.]+)\s+\(([^)]+)\)/);
    if (!entryMatch) continue;

    const name = entryMatch[1].toLowerCase();
    const versionRaw = entryMatch[2].trim();

    if (leadingSpaces === 4) {
      // Top-level gem entry — extract exact version (no specifier operators)
      // Format: "name (version)" where version is a plain version number
      const version = versionRaw.replace(/^[=<>~!]+\s*/, '') || 'unknown';
      currentParent = name;

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
    } else if (leadingSpaces >= 6 && currentParent) {
      // Child dependency entry — version might be a constraint like "~> 7.0.0"
      // Skip adding these as separate entries since they appear as 4-space entries too.
      // Just use them to update the parent relationship for the corresponding dep.
      const childName = name;
      // Find the dep we already added for this name and set its parent
      const existing = deps.find((d) => d.name === childName && d.parent === null);
      if (existing) {
        existing.parent = currentParent;
        existing.depth = 1;
      }
    }
  }

  return deps;
}

/**
 * Universal parse function for Ruby ecosystem files.
 *
 * @param {string} content - Raw file content.
 * @param {string} [filename] - Filename (unused, always Gemfile.lock).
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
export function parse(content, filename = '') {
  return parseGemfileLock(content);
}
