/**
 * @fileoverview Fetches package.json and package-lock.json from a GitHub repository
 * using the raw content API, with automatic branch fallback.
 */

import fetch from 'node-fetch';

/** Branch names to try in order when fetching raw files. */
const BRANCH_FALLBACK = ['HEAD', 'main', 'master'];

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
 * Fetches package.json and package-lock.json from a GitHub repository.
 *
 * @param {string} repoUrl - GitHub repository URL (see supported formats above).
 * @returns {Promise<{ packageJson: string, lockfile: string, projectName: string }>}
 * @throws {Error} If files are missing or the URL is invalid.
 */
export async function fetchFromGitHub(repoUrl) {
  const { owner, repo } = parseGitHubUrl(repoUrl);

  console.log(`[githubFetcher] Fetching files from ${owner}/${repo}…`);

  const [packageJson, lockfile] = await Promise.all([
    fetchRawFile(owner, repo, 'package.json'),
    fetchRawFile(owner, repo, 'package-lock.json'),
  ]);

  // Extract project name from package.json (best-effort).
  let projectName = repo;
  try {
    const parsed = JSON.parse(packageJson);
    projectName = parsed.name || repo;
  } catch (_) {
    // Fall back to repo name
  }

  return { packageJson, lockfile, projectName };
}
