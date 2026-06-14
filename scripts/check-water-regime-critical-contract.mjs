import { readFileSync } from 'node:fs';
import { REQUIRED_FAO90_METRIC_COUNT, readRequiredFao90MetricCodes } from './lib/fao90MetricContract.mjs';

const failures = [];
const requiredMetricCodes = readRequiredFao90MetricCodes();
const liveSmokeSource = readFileSync('scripts/frontend_api_v2_sp37_live_smoke.mjs', 'utf8');
const preUatSmokeSource = readFileSync('scripts/frontend_pre_uat_browser_proxy_smoke.mjs', 'utf8');
const chartSource = readFileSync('src/workspace/WaterRegimeChart.tsx', 'utf8');
const apiSource = readFileSync('src/api/kornixApi.ts', 'utf8');
const workspaceSource = readFileSync('src/workspace/WorkspacePage.tsx', 'utf8');
const legacyMetricCount = String(10 + 3);
const legacyExpectedMetricsRegex = new RegExp([
  ['EXPECTED_METRICS\\s*\\|\\|\\s*', legacyMetricCount].join(''),
  ['expectedMetrics\\s*=\\s*Number\\([^)]*\\|\\|\\s*', legacyMetricCount].join('')
].join('|'));

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

assert(
  requiredMetricCodes.length === REQUIRED_FAO90_METRIC_COUNT,
  `REQUIRED_FAO90_METRIC_CODES must contain ${REQUIRED_FAO90_METRIC_COUNT} codes, got ${requiredMetricCodes.length}.`
);

for (const [name, source] of [
  ['frontend_api_v2_sp37_live_smoke.mjs', liveSmokeSource],
  ['frontend_pre_uat_browser_proxy_smoke.mjs', preUatSmokeSource]
]) {
  assert(!legacyExpectedMetricsRegex.test(source), `${name} must not default expected metrics to 13.`);
  assert(source.includes('REQUIRED_FAO90_METRIC_COUNT'), `${name} must derive expected metric count from the FAO90 contract helper.`);
  assert(source.includes('readRequiredFao90MetricCodes'), `${name} must read full required FAO90 metrics from src/config/metrics.ts.`);
  assert(source.includes('shortwave_radiation_daily_mj_m2'), `${name} must explicitly check shortwave_radiation_daily_mj_m2.`);
}

for (const forbiddenPattern of [
  ['evapotranspirationSource !== null', '? 0 : null'].join(' '),
  ['evapotranspirationSource !== null', '? evapotranspirationSource : null'].join(' ')
]) {
  assert(!chartSource.includes(forbiddenPattern), `WaterRegimeChart must not contain null-to-zero ET fallback: ${forbiddenPattern}`);
}

assert(!/\/api\/v[1]\/kornix/.test(apiSource + workspaceSource), 'Runtime src must not use legacy KORNIX v1.');
assert(!/\/api\/admin\/v1/.test(apiSource + workspaceSource), 'Runtime src must not use /api/admin/v1.');
assert(apiSource.includes('/api/v2/kornix'), 'KORNIX runtime API must use /api/v2/kornix.');
assert(workspaceSource.includes('currentAppliedCalculationRunId'), 'Workspace flow must use currentAppliedCalculationRunId.');
assert(apiSource.includes("aggregation ?? 'area_weighted_mean'"), 'Multi-field profile requests must default aggregation to area_weighted_mean.');
assert(chartSource.includes("fieldSeasonIds.length > 1 ? 'area_weighted_mean' : undefined"), 'Chart profile query must request area_weighted_mean for 2+ fields.');

if (failures.length > 0) {
  console.error('Water regime critical contract check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Water regime critical contract check passed.');
console.log(`Required FAO90 metrics: ${requiredMetricCodes.length}/${REQUIRED_FAO90_METRIC_COUNT}`);
