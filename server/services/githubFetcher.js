/**
 * @fileoverview Fetches package.json and lockfiles from a GitHub repository
 * using the raw content API, with automatic branch fallback and multi-module discovery.
 */

import fetch from 'node-fetch';

/** Branch names to try in order when fetching raw files. */
const BRANCH_FALLBACK = ['HEAD', 'main', 'master'];

/**
 * Common subdirectory prefixes where package.json files are often found.
 * Used as a priority filter when scanning the repository tree.
 */
const COMMON_MODULE_DIRS = [
  'frontend',
  'backend',
  'client',
  'server',
  'web',
  'app',
  'src',
  'api',
];

/**
 * Parses a GitHub repository URL into { owner, repo }.
 * Supports:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - github.com/owner/repo
 *
 * @param {string} repoUrl
 * @returns {{ owner: string, repo: string }}
 * @throws {Error} If the URL cannot be parsed.
 */
function parseGitHubUrl(repoUrl) {
  const cleaned = repoUrl
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  const match = cleaned.match(/^github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(
      `Invalid GitHub URL: "${repoUrl}". Expected format: https://github.com/owner/repo`
    );
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Attempts to fetch a raw file from GitHub across multiple branches.
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath - e.g. 'package.json'
 * @returns {Promise<string>} File content as a string.
 * @throws {Error} If the file cannot be found on any branch.
 */
async function fetchRawFile(owner, repo, filePath) {
  let lastError;

  for (const branch of BRANCH_FALLBACK) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        console.log(`[githubFetcher] Fetched ${filePath} from branch "${branch}".`);
        return text;
      }
      lastError = new Error(`HTTP ${response.status} fetching ${url}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Could not fetch "${filePath}" from ${owner}/${repo} on branches [${BRANCH_FALLBACK.join(', ')}]: ${lastError.message}`
  );
}

/**
 * Attempts to fetch a raw file silently (returns null instead of throwing when not found).
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function fetchRawFileSilent(owner, repo, filePath) {
  try {
    return await fetchRawFile(owner, repo, filePath);
  } catch (_) {
    return null;
  }
}

/**
 * Determines the lockfile type string from a lockfile filename.
 * @param {string} filename
 * @returns {'npm'|'yarn'|'pnpm'|null}
 */
function lockfileType(filename) {
  if (!filename) return null;
  if (filename.endsWith('package-lock.json')) return 'npm';
  if (filename.endsWith('yarn.lock')) return 'yarn';
  if (filename.endsWith('pnpm-lock.yaml')) return 'pnpm';
  return null;
}

/**
 * Discovers all package.json manifests in a GitHub repository using the Git tree API.
 * Falls back to root-only behaviour if the tree API fails.
 *
 * Returns an array of discovered module descriptors:
 * ```js
 * [
 *   { path: "", packageJsonPath: "package.json", lockfilePath: "package-lock.json", lockfileType: "npm" },
 *   { path: "frontend", packageJsonPath: "frontend/package.json", lockfilePath: "frontend/package-lock.json", lockfileType: "npm" },
 *   { path: "server", packageJsonPath: "server/package.json", lockfilePath: null, lockfileType: null }
 * ]
 * ```
 *
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<Array<{ path: string, packageJsonPath: string, lockfilePath: string|null, lockfileType: string|null }>>}
 */
async function discoverManifests(owner, repo) {
  console.log(`[githubFetcher] Discovering manifests in ${owner}/${repo}…`);

  // Step 1: Check whether root has package.json.
  const rootPkgJson = await fetchRawFileSilent(owner, repo, 'package.json');
  const modules = [];

  if (rootPkgJson !== null) {
    // Root module: find its lockfile.
    let rootLockfilePath = null;
    for (const lf of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
      const content = await fetchRawFileSilent(owner, repo, lf);
      if (content !== null) {
        rootLockfilePath = lf;
        break;
      }
    }
    modules.push({
      path: '',
      packageJsonPath: 'package.json',
      lockfilePath: rootLockfilePath,
      lockfileType: lockfileType(rootLockfilePath),
    });
    console.log(`[githubFetcher] Root package.json found. Lockfile: ${rootLockfilePath || 'none'}.`);
  }

  // Step 2: Fetch the full repository tree to find sub-module package.json files.
  let treeFiles = [];
  try {
    let treeUrl = null;
    for (const branch of BRANCH_FALLBACK) {
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
      const resp = await fetch(url, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (resp.ok) {
        const data = await resp.json();
        treeFiles = (data.tree || []).map((f) => f.path);
        console.log(`[githubFetcher] Tree API returned ${treeFiles.length} files from branch "${branch}".`);
        treeUrl = url;
        break;
      }
      console.log(`[githubFetcher] Tree API branch "${branch}" returned HTTP ${resp.status}.`);
    }
    if (!treeUrl) {
      console.log('[githubFetcher] Tree API unavailable on all branches; skipping sub-module discovery.');
    }
  } catch (err) {
    console.log(`[githubFetcher] Tree API error: ${err.message}. Falling back to root-only.`);
    return modules.length > 0 ? modules : [
      { path: '', packageJsonPath: 'package.json', lockfilePath: null, lockfileType: null },
    ];
  }

  // Step 3: Filter package.json files to those in common dirs or up to 2 levels deep,
  //         excluding node_modules and the root (already handled above).
  const pkgJsonPaths = treeFiles.filter((p) => {
    if (!p.endsWith('/package.json')) return false;
    if (p.includes('node_modules/')) return false;
    const parts = p.split('/');
    // parts[-1] is "package.json"; everything before it is directory segments.
    // directoryDepth = number of directory segments above the file.
    const directoryDepth = parts.length - 1;
    if (directoryDepth > 2) return false;

    const topDir = parts[0];
    const isCommon = COMMON_MODULE_DIRS.includes(topDir);
    // Also include packages/* (monorepo pattern)
    const isPackages = topDir === 'packages';
    return isCommon || isPackages || directoryDepth <= 2;
  });

  console.log(`[githubFetcher] Discovered ${pkgJsonPaths.length} sub-module package.json path(s).`);

  // Step 4: For each sub-module package.json, look for a lockfile in the same directory.
  const rootPathSet = new Set(modules.map((m) => m.packageJsonPath));

  for (const pkgPath of pkgJsonPaths) {
    if (rootPathSet.has(pkgPath)) continue; // already included as root

    const dir = pkgPath.replace(/\/package\.json$/, '');
    let subLockfilePath = null;

    for (const lf of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
      const candidate = `${dir}/${lf}`;
      if (treeFiles.includes(candidate)) {
        subLockfilePath = candidate;
        break;
      }
    }

    modules.push({
      path: dir,
      packageJsonPath: pkgPath,
      lockfilePath: subLockfilePath,
      lockfileType: lockfileType(subLockfilePath),
    });
    console.log(`[githubFetcher] Sub-module found: path="${dir}", lockfile=${subLockfilePath || 'none'}.`);
  }

  // If nothing was discovered at all, return a minimal root-only entry so callers can still attempt.
  if (modules.length === 0) {
    console.log('[githubFetcher] No manifests found; returning default root entry.');
    return [{ path: '', packageJsonPath: 'package.json', lockfilePath: null, lockfileType: null }];
  }

  return modules;
}

/**
 * Fetches package.json and lockfiles from a GitHub repository, discovering all modules.
 *
 * Returns:
 * ```js
 * {
 *   projectName: "repo-name",
 *   modules: [
 *     { path: "", packageJson: "...", lockfile: "...", lockfileType: "npm" },
 *     { path: "frontend", packageJson: "...", lockfile: "...", lockfileType: "npm" },
 *     { path: "server", packageJson: "...", lockfile: null, lockfileType: null }
 *   ]
 * }
 * ```
 *
 * @param {string} repoUrl - GitHub repository URL.
 * @returns {Promise<{ projectName: string, modules: Array<{ path: string, packageJson: string, lockfile: string|null, lockfileType: string|null }> }>}
 * @throws {Error} If the URL is invalid or no package.json can be fetched.
 */
export async function fetchFromGitHub(repoUrl) {
  const { owner, repo } = parseGitHubUrl(repoUrl);

  console.log(`[githubFetcher] Starting multi-module fetch for ${owner}/${repo}…`);

  const manifests = await discoverManifests(owner, repo);
  console.log(`[githubFetcher] Total modules to fetch: ${manifests.length}.`);

  const modules = [];
  let projectName = repo;

  for (const manifest of manifests) {
    console.log(`[githubFetcher] Fetching module "${manifest.path || 'root'}"…`);

    let packageJson = null;
    try {
      packageJson = await fetchRawFile(owner, repo, manifest.packageJsonPath);
    } catch (err) {
      console.log(`[githubFetcher] Skipping module "${manifest.path}": ${err.message}`);
      continue;
    }

    // Extract project name from the root package.json.
    if (manifest.path === '' && projectName === repo) {
      try {
        const parsed = JSON.parse(packageJson);
        projectName = parsed.name || repo;
      } catch (_) {
        // Fall back to repo name
      }
    }

    let lockfile = null;
    if (manifest.lockfilePath) {
      try {
        lockfile = await fetchRawFile(owner, repo, manifest.lockfilePath);
      } catch (err) {
        console.log(`[githubFetcher] Lockfile not available for module "${manifest.path}": ${err.message}`);
      }
    }

    modules.push({
      path: manifest.path,
      packageJson,
      lockfile,
      lockfileType: manifest.lockfileType,
    });
  }

  if (modules.length === 0) {
    throw new Error(`No modules with package.json could be fetched from ${owner}/${repo}.`);
  }

  console.log(`[githubFetcher] Fetch complete. ${modules.length} module(s) ready.`);
  return { projectName, modules };
}

/**
 * Legacy signature: fetches package.json + package-lock.json from the repository root only.
 * Provided for backward compatibility.
 *
 * @param {string} repoUrl
 * @returns {Promise<{ packageJson: string, lockfile: string, projectName: string }>}
 */
export async function fetchFromGitHubLegacy(repoUrl) {
  const { owner, repo } = parseGitHubUrl(repoUrl);

  console.log(`[githubFetcher] Legacy fetch from ${owner}/${repo}…`);

  const [packageJson, lockfile] = await Promise.all([
    fetchRawFile(owner, repo, 'package.json'),
    fetchRawFile(owner, repo, 'package-lock.json'),
  ]);

  let projectName = repo;
  try {
    const parsed = JSON.parse(packageJson);
    projectName = parsed.name || repo;
  } catch (_) {
    // Fall back to repo name
  }

  return { packageJson, lockfile, projectName };
}
