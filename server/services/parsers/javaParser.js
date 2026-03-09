/**
 * @fileoverview Java/JVM ecosystem dependency parsers.
 * Supports: pom.xml (Maven), build.gradle / build.gradle.kts (Gradle)
 * All parsers return ecosystem: 'Maven'
 */

const ECOSYSTEM = 'Maven';

/** Gradle configuration names that imply dev/test dependencies. */
const DEV_CONFIGS = new Set([
  'testImplementation', 'testCompile', 'testRuntime', 'testRuntimeOnly',
  'testApi', 'testCompileOnly', 'androidTestImplementation', 'debugImplementation',
]);

/**
 * Extract text content between the first occurrence of an XML tag.
 * Only handles simple non-nested tags.
 *
 * @param {string} xml
 * @param {string} tag
 * @returns {string|null}
 */
function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Parse pom.xml (Maven) content.
 * Extracts <dependency> blocks with groupId, artifactId, version, scope.
 * Handles property references like ${project.version} by parsing <properties> block.
 * Dependency name format: "groupId:artifactId"
 * Test/provided scope → isDevDependency = true
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parsePomXml(content) {
  const deps = [];
  const seen = new Set();

  // Extract <properties> block and build a substitution map
  const propsMap = {};
  const propsMatch = content.match(/<properties>([\s\S]*?)<\/properties>/i);
  if (propsMatch) {
    const propsContent = propsMatch[1];
    const propRe = /<([A-Za-z0-9._-]+)>([^<]+)<\/[A-Za-z0-9._-]+>/g;
    let pm;
    while ((pm = propRe.exec(propsContent)) !== null) {
      propsMap[pm[1]] = pm[2].trim();
    }
  }

  /**
   * Resolves a Maven property reference like ${project.version} or ${my.version}
   * @param {string} value
   * @returns {string}
   */
  function resolveProperty(value) {
    if (!value) return 'unknown';
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => propsMap[key] || 'unknown');
  }

  // Find all <dependency> blocks (skip the <dependencyManagement> section wrapper)
  const depBlockRe = /<dependency>([\s\S]*?)<\/dependency>/gi;
  let match;

  while ((match = depBlockRe.exec(content)) !== null) {
    const block = match[1];

    const groupId = extractTag(block, 'groupId');
    const artifactId = extractTag(block, 'artifactId');
    if (!groupId || !artifactId) continue;

    const rawVersion = extractTag(block, 'version');
    const scope = (extractTag(block, 'scope') || '').toLowerCase();
    const optional = (extractTag(block, 'optional') || '').toLowerCase();

    // Skip optional dependencies
    if (optional === 'true') continue;

    const version = rawVersion ? resolveProperty(rawVersion) : 'unknown';
    const name = `${groupId.trim()}:${artifactId.trim()}`;
    const isDev = scope === 'test' || scope === 'provided';

    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deps.push({ name, version, depth: 0, isDevDependency: isDev, parent: null, ecosystem: ECOSYSTEM });
  }

  return deps;
}

/**
 * Parse build.gradle or build.gradle.kts (Gradle) content.
 * Handles both Groovy DSL and Kotlin DSL patterns:
 *   implementation 'group:artifact:version'
 *   testImplementation "group:artifact:version"
 *   implementation("group:artifact:version")
 *
 * @param {string} content
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
function parseBuildGradle(content) {
  const deps = [];
  const seen = new Set();

  // Extract the dependencies { ... } block(s)
  // We look for a pattern like: dependencies { ... }
  const depBlockRe = /\bdependencies\s*\{([\s\S]*?)\n\}/g;
  let blockMatch;

  while ((blockMatch = depBlockRe.exec(content)) !== null) {
    const block = blockMatch[1];

    // Match both Groovy style:  implementation 'group:artifact:version'
    // and Kotlin DSL style:     implementation("group:artifact:version")
    // Also handles: group = '...', name = '...', version = '...' map notation (skip for now)
    const depRe =
      /\b([A-Za-z_][A-Za-z0-9_]*)(?:\s+["']|["']\s*,?\s*["']|\s*\(\s*["'])([A-Za-z0-9._-]+):([A-Za-z0-9._-]+):([A-Za-z0-9._+\-]+)["']/g;
    let dm;

    while ((dm = depRe.exec(block)) !== null) {
      const config = dm[1];
      const group = dm[2];
      const artifact = dm[3];
      const version = dm[4];

      // Skip comment-like matches
      if (config === 'classpath' || config.startsWith('//')) continue;

      const name = `${group}:${artifact}`;
      const isDev = DEV_CONFIGS.has(config);

      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);

      deps.push({ name, version, depth: 0, isDevDependency: isDev, parent: null, ecosystem: ECOSYSTEM });
    }
  }

  // Fallback: try matching without dependencies{} block wrapper (e.g. in subprojects)
  if (deps.length === 0) {
    const depRe =
      /\b([A-Za-z_][A-Za-z0-9_]*)(?:\s+["']|["']\s*,?\s*["']|\s*\(\s*["'])([A-Za-z0-9._-]+):([A-Za-z0-9._-]+):([A-Za-z0-9._+\-]+)["']/g;
    const SKIP_KEYWORDS = new Set(['import', 'apply', 'plugins', 'id', 'version', 'classpath']);
    let dm;
    while ((dm = depRe.exec(content)) !== null) {
      const config = dm[1];
      if (SKIP_KEYWORDS.has(config) || config.startsWith('//')) continue;
      const group = dm[2];
      const artifact = dm[3];
      const version = dm[4];
      const name = `${group}:${artifact}`;
      const isDev = DEV_CONFIGS.has(config);
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deps.push({ name, version, depth: 0, isDevDependency: isDev, parent: null, ecosystem: ECOSYSTEM });
    }
  }

  return deps;
}

/**
 * Universal parse function for Java/Maven ecosystem files.
 * Auto-detects the file type from the filename.
 *
 * @param {string} content - Raw file content.
 * @param {string} [filename] - Filename to auto-detect format.
 * @returns {Array<{name, version, depth, isDevDependency, parent, ecosystem}>}
 */
export function parse(content, filename = '') {
  const lower = filename.toLowerCase();
  if (lower === 'pom.xml') return parsePomXml(content);
  if (lower.endsWith('.gradle') || lower.endsWith('.gradle.kts')) return parseBuildGradle(content);
  // Default: try pom.xml format
  return parsePomXml(content);
}
