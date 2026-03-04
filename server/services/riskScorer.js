/**
 * @fileoverview Risk scoring logic for individual dependencies and the overall project.
 */

/**
 * Calculates a 0-100 risk score for a single dependency.
 *
 * Formula:
 *   score = (cvssWeight × 0.40) + (depthPenalty × 0.20) + (prodMultiplier × 0.25) + (vulnCountWeight × 0.15)
 *
 * Where:
 *   cvssWeight     = (highestCVSS / 10) × 100
 *   depthPenalty   = (1 / (depth + 1)) × 100
 *   prodMultiplier = isDevDependency ? 30 : 100
 *   vulnCountWeight = min(vulnCount × 15, 100)
 *
 * Returns 0 if the dependency has no vulnerabilities.
 *
 * @param {{
 *   depth: number,
 *   isDevDependency: boolean,
 *   vulnerabilities?: Array<{cvssScore?: number}>
 * }} dependency
 * @returns {number} Risk score in the range [0, 100].
 */
export function calculateDependencyRisk(dependency) {
  const vulns = dependency.vulnerabilities || [];
  if (vulns.length === 0) return 0;

  const highestCVSS = vulns.reduce((max, v) => {
    const score = typeof v.cvssScore === 'number' ? v.cvssScore : 5;
    return Math.max(max, score);
  }, 0);

  const cvssWeight = (highestCVSS / 10) * 100;
  const depthPenalty = (1 / ((dependency.depth || 0) + 1)) * 100;
  const prodMultiplier = dependency.isDevDependency ? 30 : 100;
  const vulnCountWeight = Math.min(vulns.length * 15, 100);

  const score =
    cvssWeight * 0.40 +
    depthPenalty * 0.20 +
    prodMultiplier * 0.25 +
    vulnCountWeight * 0.15;

  return Math.round(Math.min(score, 100) * 100) / 100;
}

/**
 * Computes the overall project risk score and a vulnerability summary from a list
 * of scored dependencies.
 *
 * The overall score considers the top-10 riskiest dependencies:
 *   - Top 3  contribute 60 % of the score.
 *   - Next 7 contribute 40 % of the score.
 *
 * @param {Array<{
 *   vulnerabilities?: Array<{severity?: string, cvssScore?: number}>,
 *   riskScore?: number,
 *   depth?: number,
 *   isDevDependency?: boolean
 * }>} dependencies
 * @returns {{
 *   overallRisk: number,
 *   summary: { critical: number, high: number, medium: number, low: number, total: number }
 * }}
 */
export function calculateOverallRisk(dependencies) {
  // Build vulnerability summary
  const summary = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const dep of dependencies) {
    for (const vuln of dep.vulnerabilities || []) {
      const sev = (vuln.severity || '').toLowerCase();
      if (sev in summary) summary[sev]++;
      summary.total++;
    }
  }

  // Sort dependencies by riskScore descending and take top 10
  const sorted = [...dependencies]
    .filter((d) => (d.riskScore || 0) > 0)
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

  const top10 = sorted.slice(0, 10);
  if (top10.length === 0) return { overallRisk: 0, summary };

  const top3 = top10.slice(0, 3);
  const next7 = top10.slice(3);

  const avg = (arr) => arr.reduce((s, d) => s + (d.riskScore || 0), 0) / arr.length;

  let overallRisk = avg(top3) * 0.6;
  if (next7.length > 0) {
    overallRisk += avg(next7) * 0.4;
  } else {
    // If there are fewer than 4 scored deps, allocate the full weight to what we have
    overallRisk = avg(top3);
  }

  return { overallRisk: Math.round(overallRisk * 100) / 100, summary };
}
