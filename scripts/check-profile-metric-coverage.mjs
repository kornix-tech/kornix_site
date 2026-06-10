import { readFileSync } from 'node:fs';

const metricsSource = readFileSync('src/config/metrics.ts', 'utf8');
const chartSource = readFileSync('src/workspace/WaterRegimeChart.tsx', 'utf8');

const requiredArrayMatch = metricsSource.match(/REQUIRED_FAO90_METRIC_CODES:[\s\S]*?=\s*\[([\s\S]*?)\];/);
const requiredMetricCodes = requiredArrayMatch
  ? [...requiredArrayMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  : [];
const metricCodes = [...metricsSource.matchAll(/long_name_for_code:\s*'([^']+)'/g)].map((match) => match[1]);
const disabledMetricCodes = [];
const metadataOnlyMetricCodes = new Set(disabledMetricCodes);
const requiredVisibleMetricCodes = metricCodes.filter((code) => !metadataOnlyMetricCodes.has(code));

const failures = [];

if (metricCodes.length === 0) {
  failures.push('No KORNIX_METRICS entries were found in src/config/metrics.ts.');
}

if (requiredMetricCodes.length !== 44) {
  failures.push(`Expected 44 REQUIRED_FAO90_METRIC_CODES, got ${requiredMetricCodes.length}.`);
}

for (const code of requiredMetricCodes) {
  if (!metricCodes.includes(code)) {
    failures.push(`${code} is missing from KORNIX_METRICS presentation registry.`);
  }
}

for (const requiredSnippet of [
  'shortwaveRadiationDaily',
  'shortwaveRadiationDailyFact',
  'shortwaveRadiationDailyForecast',
  'shortwave_radiation_daily_mj_m2',
  'metricCsvColumns',
  'metricCsvValues',
  'Fao90MetricSummary',
  'calculation_diagnostics_json',
  'crop_stage_code'
]) {
  if (!chartSource.includes(requiredSnippet)) {
    failures.push(`Missing FAO90 chart/export snippet: ${requiredSnippet}`);
  }
}

if (failures.length > 0) {
  console.error('Profile metric coverage check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Profile metric coverage check passed.');
console.log(`Required FAO90 metrics: ${requiredMetricCodes.length}/44`);
console.log(`Presentation registry metrics: ${requiredVisibleMetricCodes.length}/${metricCodes.length}`);
