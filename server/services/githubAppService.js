/**
 * @fileoverview GitHub App service — handles PR webhook events and posts results
 * back to GitHub as check runs and PR comments.
 *
 * Environment variables required:
 *   GITHUB_APP_ID          — Numeric GitHub App ID.
 *   GITHUB_APP_PRIVATE_KEY — PEM-encoded RSA private key (newlines as \n).
 *   GITHUB_WEBHOOK_SECRET  — Secret used to sign inbound webhook payloads.
 *
 * The service is intentionally stateless: each function receives the tokens /
 * credentials it needs rather than caching them as module-level singletons.
 */

import crypto from 'crypto';
import fetch from 'node-fetch';

import { parseLockfile } from './dependencyParser.js';
import { scanVulnerabilities } from './vulnScanner.js';
import { calculateDependencyRisk, calculateOverallRisk } from './riskScorer.js';
import Scan from '../models/Scan.js';
import Dependency from '../models/Dependency.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API = 'https://api.github.com';

/** Risk-score thresholds that map to a Pass / Warn / Fail check conclusion. */
const RISK_THRESHOLDS = {
  pass: 40,    // score ≤ 40 → success
  warn: 70,    // 40 < score ≤ 70 → neutral (warning)
               // score > 70 → failure
};

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies the `X-Hub-Signature-256` header sent by GitHub for every webhook.
 *
 * @param {Buffer|string} rawBody      - The raw (unparsed) request body.
 * @param {string}        signature256 - Value of the X-Hub-Signature-256 header.
 * @param {string}        secret       - GITHUB_WEBHOOK_SECRET.
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signature256, secret) {
  if (!signature256 || !secret) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;

  // Constant-time comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature256),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GitHub App JWT & installation token
// ---------------------------------------------------------------------------

/**
 * Generates a short-lived JWT that authenticates the GitHub App itself.
 * Valid for 60 seconds (GitHub maximum is 10 minutes but 60 s is safer).
 *
 * @returns {string} A signed JWT.
 */
function generateAppJWT() {
  const appId      = process.env.GITHUB_APP_ID;
  const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!appId || !privateKey) {
    throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set.');
  }

  const now     = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 60, iss: appId })).toString('base64url');

  const data      = `${header}.${payload}`;
  const signature = crypto.createSign('RSA-SHA256').update(data).sign(privateKey, 'base64url');

  return `${data}.${signature}`;
}

/**
 * Exchanges a GitHub App installation ID for a short-lived installation access token.
 *
 * @param {number|string} installationId
 * @returns {Promise<string>} Bearer token for GitHub API requests.
 */
export async function getInstallationToken(installationId) {
  const appJwt = generateAppJWT();

  const resp = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to obtain installation token (HTTP ${resp.status}): ${body}`);
  }

  const data = await resp.json();
  return data.token;
}

// ---------------------------------------------------------------------------
// File fetching
// ---------------------------------------------------------------------------

/**
 * Fetches the content of a single file from a PR's head commit via the
 * GitHub Contents API.
 *
 * @param {string} token     - Installation access token.
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref       - Commit SHA or branch name.
 * @param {string} filePath  - e.g. 'package.json'
 * @returns {Promise<string|null>} UTF-8 file content, or null if not found.
 */
async function fetchFileContent(token, owner, repo, ref, filePath) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!resp.ok) return null;

  const data = await resp.json();
  if (data.encoding === 'base64' && data.content) {
    // GitHub returns base64 content with line breaks every 60 characters.
    // Strip them before decoding.
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Check run
// ---------------------------------------------------------------------------

/**
 * Creates or updates a GitHub Check Run with SecureFlow scan results.
 *
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} sha      - Head commit SHA of the PR.
 * @param {{ riskScore: number, summary: Object, scanId: string }} result
 * @returns {Promise<void>}
 */
export async function postCheckRun(token, owner, repo, sha, result) {
  const { riskScore, summary, scanId } = result;

  let conclusion;
  if (riskScore <= RISK_THRESHOLDS.pass) {
    conclusion = 'success';
  } else if (riskScore <= RISK_THRESHOLDS.warn) {
    conclusion = 'neutral';
  } else {
    conclusion = 'failure';
  }

  const badge = riskScore <= RISK_THRESHOLDS.pass
    ? '🟢 Low Risk'
    : riskScore <= RISK_THRESHOLDS.warn
      ? '🟡 Medium Risk'
      : '🔴 High Risk';

  const summaryText = [
    `**SecureFlow Dependency Scan**`,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Risk Score | **${riskScore} / 100** ${badge} |`,
    `| Critical | ${summary.critical ?? 0} |`,
    `| High | ${summary.high ?? 0} |`,
    `| Medium | ${summary.medium ?? 0} |`,
    `| Low | ${summary.low ?? 0} |`,
    `| Total Vulnerabilities | ${summary.total ?? 0} |`,
  ].join('\n');

  const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
  const scanUrl = `${serverUrl}/scans/${scanId}`;

  const body = {
    name: 'SecureFlow Dependency Scan',
    head_sha: sha,
    status: 'completed',
    conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title: `Risk Score: ${riskScore}/100 — ${conclusion === 'success' ? 'Approved' : conclusion === 'neutral' ? 'Warning' : 'Blocked'}`,
      summary: summaryText,
      text: `[View full scan report](${scanUrl})`,
    },
  };

  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`[githubAppService] postCheckRun failed (HTTP ${resp.status}): ${errBody}`);
  } else {
    console.log(`[githubAppService] Check run posted for ${owner}/${repo}@${sha} — conclusion: ${conclusion}`);
  }
}

// ---------------------------------------------------------------------------
// PR comment
// ---------------------------------------------------------------------------

/**
 * Posts a SecureFlow scan-results comment on a pull request.
 * If a previous SecureFlow comment exists it is updated rather than duplicated.
 *
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @param {{ riskScore: number, summary: Object, scanId: string }} result
 * @returns {Promise<void>}
 */
export async function postComment(token, owner, repo, prNumber, result) {
  const { riskScore, summary, scanId } = result;

  const badge = riskScore <= RISK_THRESHOLDS.pass
    ? '![Low Risk](https://img.shields.io/badge/risk-low-brightgreen)'
    : riskScore <= RISK_THRESHOLDS.warn
      ? '![Medium Risk](https://img.shields.io/badge/risk-medium-yellow)'
      : '![High Risk](https://img.shields.io/badge/risk-high-red)';

  const status = riskScore <= RISK_THRESHOLDS.pass
    ? '✅ **Approved** — risk score within acceptable limits.'
    : riskScore <= RISK_THRESHOLDS.warn
      ? '⚠️ **Warning** — elevated risk score detected.'
      : '🚫 **Blocked** — risk score exceeds threshold.';

  const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
  const scanUrl = `${serverUrl}/scans/${scanId}`;

  const marker = '<!-- secureflow-scan-comment -->';
  const commentBody = [
    marker,
    `## SecureFlow Dependency Scan ${badge}`,
    '',
    status,
    '',
    `**Risk Score: ${riskScore} / 100**`,
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| 🔴 Critical | ${summary.critical ?? 0} |`,
    `| 🟠 High | ${summary.high ?? 0} |`,
    `| 🟡 Medium | ${summary.medium ?? 0} |`,
    `| 🔵 Low | ${summary.low ?? 0} |`,
    `| **Total** | **${summary.total ?? 0}** |`,
    '',
    `[📊 View Full Report](${scanUrl})`,
    '',
    `<sub>Scan ID: \`${scanId}\` — powered by [SecureFlow](${serverUrl})</sub>`,
  ].join('\n');

  // Check for an existing SecureFlow comment to update instead of creating a new one.
  const listResp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  let existingCommentId = null;
  if (listResp.ok) {
    const comments = await listResp.json();
    const existing = comments.find((c) => c.body && c.body.includes(marker));
    if (existing) existingCommentId = existing.id;
  }

  const url = existingCommentId
    ? `${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${existingCommentId}`
    : `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  const method = existingCommentId ? 'PATCH' : 'POST';

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: commentBody }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`[githubAppService] postComment failed (HTTP ${resp.status}): ${errBody}`);
  } else {
    console.log(`[githubAppService] Comment ${existingCommentId ? 'updated' : 'posted'} on PR #${prNumber}.`);
  }
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

/**
 * Processes an inbound GitHub webhook event.
 *
 * Currently handles `pull_request` events with actions:
 *   - opened
 *   - synchronize
 *   - reopened
 *
 * Fetches the PR's package.json + package-lock.json, runs the scan pipeline
 * directly (no internal HTTP round-trip), then posts a check run and a
 * PR comment with the results.
 *
 * @param {string} event    - Value of the X-GitHub-Event header (e.g. 'pull_request').
 * @param {Object} payload  - Parsed webhook JSON payload.
 * @returns {Promise<{ handled: boolean, message: string }>}
 */
export async function handleWebhook(event, payload) {
  if (event !== 'pull_request') {
    return { handled: false, message: `Ignored event type: ${event}` };
  }

  const action = payload.action;
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return { handled: false, message: `Ignored pull_request action: ${action}` };
  }

  const { installation, repository, pull_request: pr } = payload;
  if (!installation || !repository || !pr) {
    return { handled: false, message: 'Missing required webhook fields.' };
  }

  const owner       = repository.owner.login;
  const repo        = repository.name;
  const sha         = pr.head.sha;
  const prNumber    = pr.number;
  const installId   = installation.id;

  console.log(`[githubAppService] Handling PR #${prNumber} (${action}) for ${owner}/${repo}@${sha}`);

  let token;
  try {
    token = await getInstallationToken(installId);
  } catch (err) {
    console.error(`[githubAppService] Could not obtain installation token: ${err.message}`);
    return { handled: false, message: err.message };
  }

  // Fetch package files from the PR's head commit.
  const [packageJsonStr, lockfileStr] = await Promise.all([
    fetchFileContent(token, owner, repo, sha, 'package.json'),
    fetchFileContent(token, owner, repo, sha, 'package-lock.json'),
  ]);

  if (!packageJsonStr || !lockfileStr) {
    const msg = `package.json or package-lock.json not found in ${owner}/${repo}@${sha}`;
    console.log(`[githubAppService] ${msg}`);
    return { handled: false, message: msg };
  }

  // Run the scan pipeline directly (no HTTP round-trip).
  const { projectName, directCount, transitiveCount, dependencies } = await parseLockfile(
    packageJsonStr,
    lockfileStr
  );
  const scannedDeps = await scanVulnerabilities(dependencies);
  const scoredDeps  = scannedDeps.map((dep) => ({
    ...dep,
    riskScore: calculateDependencyRisk(dep),
  }));
  const { overallRisk, summary } = calculateOverallRisk(scoredDeps);

  const scan = await Scan.create({
    projectName,
    source: 'github',
    repoUrl: `https://github.com/${owner}/${repo}`,
    totalDependencies: dependencies.length,
    directDependencies: directCount,
    transitiveDependencies: transitiveCount,
    vulnerabilityCount: summary,
    riskScore: overallRisk,
    status: 'complete',
  });

  if (scoredDeps.length > 0) {
    await Dependency.insertMany(
      scoredDeps.map((dep) => ({
        scanId: scan._id,
        name: dep.name,
        version: dep.version,
        depth: dep.depth,
        isDevDependency: dep.isDevDependency || false,
        parent: dep.parent || undefined,
        vulnerabilities: dep.vulnerabilities || [],
        riskScore: dep.riskScore || 0,
      }))
    );
  }

  const scanResult = { scanId: scan._id.toString(), riskScore: overallRisk, summary };

  // Post results back to GitHub.
  await Promise.all([
    postCheckRun(token, owner, repo, sha, scanResult),
    postComment(token, owner, repo, prNumber, scanResult),
  ]);

  return {
    handled: true,
    message: `Scan complete. Risk score: ${scanResult.riskScore}`,
  };
}
