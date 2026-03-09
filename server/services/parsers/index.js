/**
 * @fileoverview Parser registry for multi-ecosystem dependency scanning.
 *
 * Exports:
 *   detectEcosystem(filename)    → { ecosystem, parser, fileType }
 *   parseEcosystemFile(filename, content, metaContent?) → { projectName, dependencies, ecosystem }
 */

import { parse as parsePython } from './pythonParser.js';
import { parse as parseJava } from './javaParser.js';
import { parse as parseGo } from './goParser.js';
import { parse as parseRust } from './rustParser.js';
import { parse as parseRuby } from './rubyParser.js';

/**
 * Registry mapping filename patterns to ecosystem metadata and parser functions.
 * Order matters — more specific patterns should come first.
 */
const REGISTRY = [
  // npm
  { pattern: /^package-lock\.json$/i, ecosystem: 'npm', fileType: 'lockfile', parser: null },
  { pattern: /^package\.json$/i,      ecosystem: 'npm', fileType: 'manifest', parser: null },

  // PyPI
  { pattern: /^requirements.*\.txt$/i, ecosystem: 'PyPI', fileType: 'requirements', parser: parsePython },
  { pattern: /^pipfile\.lock$/i,       ecosystem: 'PyPI', fileType: 'lockfile',      parser: parsePython },
  { pattern: /^poetry\.lock$/i,        ecosystem: 'PyPI', fileType: 'lockfile',      parser: parsePython },

  // Maven / Gradle
  { pattern: /^pom\.xml$/i,              ecosystem: 'Maven', fileType: 'manifest', parser: parseJava },
  { pattern: /^build\.gradle$/i,         ecosystem: 'Maven', fileType: 'buildfile', parser: parseJava },
  { pattern: /^build\.gradle\.kts$/i,    ecosystem: 'Maven', fileType: 'buildfile', parser: parseJava },

  // Go
  { pattern: /^go\.mod$/i, ecosystem: 'Go', fileType: 'manifest', parser: parseGo },
  { pattern: /^go\.sum$/i, ecosystem: 'Go', fileType: 'lockfile',  parser: parseGo },

  // Rust
  { pattern: /^cargo\.lock$/i, ecosystem: 'crates.io', fileType: 'lockfile', parser: parseRust },

  // Ruby
  { pattern: /^gemfile\.lock$/i, ecosystem: 'RubyGems', fileType: 'lockfile', parser: parseRuby },
];

/**
 * Detect the ecosystem for a given filename.
 *
 * @param {string} filename
 * @returns {{ ecosystem: string, parser: Function|null, fileType: string }|null}
 *   Returns null if the filename doesn't match any known pattern.
 */
export function detectEcosystem(filename) {
  if (!filename) return null;
  // Match against the basename only (strip any leading path)
  const basename = filename.split('/').pop().split('\\').pop();
  for (const entry of REGISTRY) {
    if (entry.pattern.test(basename)) {
      return { ecosystem: entry.ecosystem, parser: entry.parser, fileType: entry.fileType };
    }
  }
  return null;
}

/**
 * Parse an ecosystem file using the appropriate parser.
 *
 * @param {string} filename  - Name of the file (used to detect ecosystem).
 * @param {string} content   - Raw file content.
 * @param {string} [metaContent] - Optional secondary file content (e.g. package.json alongside package-lock.json).
 * @returns {{ projectName: string, dependencies: Array, ecosystem: string }}
 * @throws {Error} If the filename doesn't match a supported ecosystem or is npm (handled separately).
 */
export function parseEcosystemFile(filename, content, metaContent) {
  const detected = detectEcosystem(filename);
  if (!detected) {
    throw new Error(`Unsupported file type: "${filename}". Supported files: requirements.txt, Pipfile.lock, poetry.lock, pom.xml, build.gradle, build.gradle.kts, go.mod, go.sum, Cargo.lock, Gemfile.lock`);
  }

  if (detected.ecosystem === 'npm') {
    throw new Error('npm files (package-lock.json, package.json) must be processed via the standard upload endpoint.');
  }

  if (!detected.parser) {
    throw new Error(`No parser registered for "${filename}".`);
  }

  const dependencies = detected.parser(content, filename);

  // Derive a project name from the filename / content
  let projectName = 'unknown-project';

  if (detected.ecosystem === 'Maven' && filename.toLowerCase() === 'pom.xml') {
    // Try to extract <artifactId> from pom.xml
    const m = content.match(/<artifactId>([^<]+)<\/artifactId>/i);
    if (m) projectName = m[1].trim();
  } else if (detected.ecosystem === 'Go' && filename.toLowerCase() === 'go.mod') {
    // Try to extract module name: "module github.com/owner/repo"
    const m = content.match(/^module\s+([^\s]+)/m);
    if (m) {
      const parts = m[1].split('/');
      projectName = parts[parts.length - 1];
    }
  } else if (detected.ecosystem === 'PyPI' && filename.toLowerCase() === 'poetry.lock') {
    // Poetry.lock doesn't have project name; attempt from metaContent (pyproject.toml)
    if (metaContent) {
      const m = metaContent.match(/^name\s*=\s*"([^"]+)"/m);
      if (m) projectName = m[1];
    }
  } else if (detected.ecosystem === 'crates.io') {
    // Try to extract root package name (first [[package]] without source)
    const rootMatch = content.match(/\[\[package\]\][\s\S]*?^name\s*=\s*"([^"]+)"/m);
    if (rootMatch) projectName = rootMatch[1];
  }

  const directCount = dependencies.filter((d) => d.depth === 0).length;
  const transitiveCount = dependencies.filter((d) => d.depth > 0).length;

  console.log(
    `[parsers/index] Parsed "${projectName}" (${detected.ecosystem}): ${directCount} direct, ${transitiveCount} transitive dependencies.`
  );

  return {
    projectName,
    directCount,
    transitiveCount,
    dependencies,
    ecosystem: detected.ecosystem,
  };
}
