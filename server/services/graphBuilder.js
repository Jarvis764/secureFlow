/**
 * @fileoverview Builds a graph data structure (nodes + links) from a flat dependency array
 * for use in dependency visualisation.
 */

/** Severity order for determining the "worst" severity on a node. */
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

/**
 * Returns the highest severity string from a list of vulnerabilities.
 * @param {Array<{severity?: string}>} vulns
 * @returns {string|null}
 */
function maxSeverity(vulns) {
  if (!vulns || vulns.length === 0) return null;
  for (const sev of SEVERITY_ORDER) {
    if (vulns.some((v) => (v.severity || '').toLowerCase() === sev)) return sev;
  }
  return null;
}

/**
 * Builds graph data (nodes and links) from a flat, scored dependency array.
 *
 * The graph includes a root node representing the project itself.
 * Links represent parent → child dependency relationships.
 *
 * @param {Array<{
 *   name: string,
 *   version: string,
 *   depth: number,
 *   isDevDependency: boolean,
 *   parent: string|null,
 *   vulnerabilities?: Array<{severity?: string}>,
 *   riskScore?: number
 * }>} dependencies - Flat dependency array, already enriched with vulnerabilities and risk scores.
 * @returns {{ nodes: Array<Object>, links: Array<{source: string, target: string}> }}
 */
export function buildGraphData(dependencies) {
  const nodes = [];
  const links = [];

  // Count how many other packages depend on each package name.
  const dependentCount = new Map();
  for (const dep of dependencies) {
    if (dep.parent) {
      dependentCount.set(dep.parent, (dependentCount.get(dep.parent) || 0) + 1);
    }
  }

  // Root node representing the project.
  const rootId = 'root';
  nodes.push({
    id: rootId,
    name: 'project',
    version: '',
    depth: -1,
    isDevDep: false,
    vulnCount: 0,
    maxSeverity: null,
    riskScore: 0,
    dependentCount: dependencies.filter((d) => d.depth === 0).length,
  });

  for (const dep of dependencies) {
    const id = `${dep.name}@${dep.version}`;
    const vulns = dep.vulnerabilities || [];

    nodes.push({
      id,
      name: dep.name,
      version: dep.version,
      depth: dep.depth,
      isDevDep: dep.isDevDependency || false,
      vulnCount: vulns.length,
      maxSeverity: maxSeverity(vulns),
      riskScore: dep.riskScore || 0,
      dependentCount: dependentCount.get(dep.name) || 0,
    });

    // Create a link from parent → this dependency.
    const sourceId = dep.parent ? `${dep.parent}` : rootId;
    links.push({ source: sourceId, target: id });
  }

  return { nodes, links };
}
