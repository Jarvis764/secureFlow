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
 * When multiple modules are present, intermediate module-group nodes (e.g. "📁 frontend")
 * are inserted between the root and their depth-0 dependencies.
 *
 * @param {Array<{
 *   name: string,
 *   version: string,
 *   depth: number,
 *   isDevDependency: boolean,
 *   parent: string|null,
 *   modulePath?: string,
 *   vulnerabilities?: Array<{severity?: string}>,
 *   riskScore?: number
 * }>} dependencies - Flat dependency array, already enriched with vulnerabilities and risk scores.
 * @param {string[]} [modules] - Optional list of module paths (e.g. ["", "frontend", "server"]).
 *   When provided and length > 1, module-group nodes are added.
 * @returns {{ nodes: Array<Object>, links: Array<{source: string, target: string}> }}
 */
export function buildGraphData(dependencies, modules) {
  const nodes = [];
  const links = [];

  // Determine whether to render module-group nodes.
  const useModuleGroups = Array.isArray(modules) && modules.length > 1;

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
    modulePath: '',
    dependentCount: dependencies.filter((d) => d.depth === 0).length,
  });

  // If using module groups, create an intermediate node for each module.
  const moduleGroupIds = new Map(); // modulePath → groupNodeId
  if (useModuleGroups) {
    for (const modulePath of modules) {
      const label = modulePath === '' ? '(root)' : modulePath;
      const groupId = `module:${label}`;
      moduleGroupIds.set(modulePath, groupId);
      nodes.push({
        id: groupId,
        name: `📁 ${label}`,
        version: '',
        depth: 0,
        isDevDep: false,
        vulnCount: 0,
        maxSeverity: null,
        riskScore: 0,
        modulePath,
        isModuleGroup: true,
        dependentCount: dependencies.filter(
          (d) => d.depth === 0 && (d.modulePath || '') === modulePath
        ).length,
      });
      links.push({ source: rootId, target: groupId });
    }
  }

  // Build a map from package name → node ID so parent links resolve to valid nodes.
  // When multiple versions of the same package exist, the shallowest one wins.
  const nameToId = new Map();
  const sorted = [...dependencies].sort((a, b) => a.depth - b.depth);
  for (const dep of sorted) {
    if (!nameToId.has(dep.name)) {
      nameToId.set(dep.name, `${dep.name}@${dep.version}`);
    }
  }

  for (const dep of dependencies) {
    const id = `${dep.name}@${dep.version}`;
    const vulns = dep.vulnerabilities || [];
    const depModulePath = dep.modulePath || '';

    nodes.push({
      id,
      name: dep.name,
      version: dep.version,
      depth: dep.depth,
      isDevDep: dep.isDevDependency || false,
      vulnCount: vulns.length,
      maxSeverity: maxSeverity(vulns),
      riskScore: dep.riskScore || 0,
      modulePath: depModulePath,
      dependentCount: dependentCount.get(dep.name) || 0,
      ecosystem: dep.ecosystem || 'npm',
    });

    // Create a link from parent → this dependency using the resolved name@version ID.
    // For depth-0 deps with module groups, link to the module group instead of root.
    let sourceId;
    if (dep.parent) {
      sourceId = nameToId.get(dep.parent) || rootId;
    } else if (useModuleGroups && dep.depth === 0) {
      sourceId = moduleGroupIds.get(depModulePath) || rootId;
    } else {
      sourceId = rootId;
    }
    links.push({ source: sourceId, target: id });
  }

  return { nodes, links };
}
