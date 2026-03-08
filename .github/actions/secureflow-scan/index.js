/**
 * SecureFlow GitHub Action — index.js
 *
 * Reads the project's package.json + lockfile from the workspace,
 * calls the SecureFlow /api/v1/scan endpoint, posts the results as
 * GitHub Actions annotations, and fails the step if the risk score
 * exceeds the configured threshold.
 *
 * Inputs (from action.yml):
 *   api-url           — Base URL of the SecureFlow server.
 *   api-key           — SecureFlow API key (X-API-Key).
 *   package-json-path — Relative path to package.json (default: 'package.json').
 *   lockfile-path     — Relative path to the lockfile (default: 'package-lock.json').
 *   threshold         — Risk score threshold; exceeding it fails the step (default: '70').
 *
 * Outputs (set via @actions/core):
 *   risk-score      — Overall risk score (0–100).
 *   critical-count  — Number of critical vulnerabilities.
 *   high-count      — Number of high vulnerabilities.
 *   scan-url        — URL of the full report in SecureFlow.
 */

const core   = require('@actions/core');
const fs     = require('fs');
const path   = require('path');
const fetch  = require('node-fetch');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a file from the workspace (GITHUB_WORKSPACE) and return its content.
 *
 * @param {string} relativePath
 * @returns {string}
 */
function readWorkspaceFile(relativePath) {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const fullPath  = path.resolve(workspace, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Map a numeric risk score to a descriptive label.
 *
 * @param {number} score
 * @returns {string}
 */
function riskLabel(score) {
  if (score <= 40)  return 'Low';
  if (score <= 70)  return 'Medium';
  return 'High';
}

/**
 * Returns the pluralized word based on count.
 * @param {number} count
 * @param {string} singular - singular form, e.g. 'vulnerability'
 * @param {string} plural   - plural form, e.g. 'vulnerabilities'
 * @returns {string} e.g. '1 vulnerability' or '3 vulnerabilities'
 */
function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  try {
    // 1. Read inputs.
    const apiUrl          = core.getInput('api-url',           { required: true  });
    const apiKey          = core.getInput('api-key',           { required: true  });
    const packageJsonPath = core.getInput('package-json-path', { required: false }) || 'package.json';
    const lockfilePath    = core.getInput('lockfile-path',     { required: false }) || 'package-lock.json';
    const thresholdStr    = core.getInput('threshold',         { required: false }) || '70';
    const threshold       = parseInt(thresholdStr, 10);

    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      core.setFailed(`Invalid "threshold" value: "${thresholdStr}". Must be a number between 0 and 100.`);
      return;
    }

    // 2. Read package files from the workspace.
    core.info(`Reading ${packageJsonPath}…`);
    const packageJson = readWorkspaceFile(packageJsonPath);

    core.info(`Reading ${lockfilePath}…`);
    const lockfile = readWorkspaceFile(lockfilePath);

    // 3. Call the SecureFlow API.
    core.info(`Submitting scan to ${apiUrl}/api/v1/scan…`);
    const resp = await fetch(`${apiUrl}/api/v1/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ packageJson, lockfile }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`SecureFlow API error (HTTP ${resp.status}): ${body}`);
    }

    const result = await resp.json();
    const { riskScore, summary, scanUrl } = result;

    // 4. Set outputs.
    core.setOutput('risk-score',     String(riskScore));
    core.setOutput('critical-count', String(summary?.critical ?? 0));
    core.setOutput('high-count',     String(summary?.high     ?? 0));
    core.setOutput('scan-url',       scanUrl || '');

    // 5. Post annotations.
    const label = riskLabel(riskScore);
    core.info(`SecureFlow scan complete — Risk Score: ${riskScore}/100 (${label})`);
    core.info(`  Critical : ${summary?.critical ?? 0}`);
    core.info(`  High     : ${summary?.high     ?? 0}`);
    core.info(`  Medium   : ${summary?.medium   ?? 0}`);
    core.info(`  Low      : ${summary?.low      ?? 0}`);
    core.info(`  Total    : ${summary?.total    ?? 0}`);

    if (scanUrl) {
      core.info(`Full report : ${scanUrl}`);
    }

    // Post a notice with the summary for the GitHub Actions UI.
    core.notice(
      [
        `SecureFlow Dependency Scan — Risk Score: ${riskScore}/100 (${label})`,
        `Critical: ${summary?.critical ?? 0}  High: ${summary?.high ?? 0}  Medium: ${summary?.medium ?? 0}  Low: ${summary?.low ?? 0}`,
        scanUrl ? `Report: ${scanUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      { title: `SecureFlow: Risk ${label} (${riskScore}/100)` }
    );

    // Emit a warning annotation if there are critical or high vulnerabilities.
    if ((summary?.critical ?? 0) > 0) {
      core.warning(
        `${pluralize(summary.critical, 'vulnerability', 'vulnerabilities')} found at critical severity. Review the full report: ${scanUrl}`,
        { title: 'SecureFlow: Critical Vulnerabilities Detected' }
      );
    } else if ((summary?.high ?? 0) > 0) {
      core.warning(
        `${pluralize(summary.high, 'vulnerability', 'vulnerabilities')} found at high severity.`,
        { title: 'SecureFlow: High Vulnerabilities Detected' }
      );
    }

    // 6. Fail the workflow if the risk score exceeds the threshold.
    if (riskScore > threshold) {
      core.setFailed(
        `SecureFlow scan FAILED: risk score ${riskScore} exceeds the configured threshold of ${threshold}. ` +
        `${summary?.critical ?? 0} critical, ${summary?.high ?? 0} high vulnerabilities detected. ` +
        (scanUrl ? `See full report: ${scanUrl}` : '')
      );
    }
  } catch (err) {
    core.setFailed(`SecureFlow Action error: ${err.message}`);
  }
}

run();
