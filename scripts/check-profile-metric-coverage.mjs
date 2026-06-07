import { readFileSync } from 'node:fs';

const metricsSource = readFileSync('src/config/metrics.ts', 'utf8');
const chartSource = readFileSync('src/workspace/WaterRegimeChart.tsx', 'utf8');

const metricBlocks = [...metricsSource.matchAll(/\{\s*long_name_for_code:\s*'([^']+)'[\s\S]*?\n\s*\}/g)];
const metricCodes = metricBlocks.map((match) => match[1]);
const disabledMetricCodes = metricBlocks
  .filter((match) => /isEnabled:\s*false/.test(match[0]))
  .map((match) => match[1]);
const metadataOnlyMetricCodes = new Set(disabledMetricCodes);
const requiredVisibleMetricCodes = metricCodes.filter((code) => !metadataOnlyMetricCodes.has(code));

const failures = [];

if (metricCodes.length === 0) {
  failures.push('No KORNIX_METRICS entries were found in src/config/metrics.ts.');
}

for (const code of requiredVisibleMetricCodes) {
  const occurrences = chartSource.match(new RegExp(code, 'g')) ?? [];
  if (occurrences.length < 2) {
    failures.push(`${code} is not both consumed and exported by WaterRegimeChart.`);
  }
}

for (const requiredSnippet of [
  'shortwaveRadiationDaily',
  'shortwaveRadiationDailyFact',
  'shortwaveRadiationDailyForecast',
  'shortwave_radiation_daily_mj_m2',
  'Солнечная радиация, МДж/м²/сутки'
]) {
  if (!chartSource.includes(requiredSnippet)) {
    failures.push(`Missing shortwave chart/export snippet: ${requiredSnippet}`);
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
console.log(`Visible/exported metrics: ${requiredVisibleMetricCodes.length}/${metricCodes.length}`);
