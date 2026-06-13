import { readFileSync } from 'node:fs';

export const REQUIRED_FAO90_METRIC_COUNT = 44;

export function readRequiredFao90MetricCodes(metricsPath = 'src/config/metrics.ts') {
  const metricsSource = readFileSync(metricsPath, 'utf8');
  const requiredArrayMatch = metricsSource.match(/REQUIRED_FAO90_METRIC_CODES:[\s\S]*?=\s*\[([\s\S]*?)\];/);
  const metricCodes = requiredArrayMatch
    ? [...requiredArrayMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
    : [];

  if (metricCodes.length !== REQUIRED_FAO90_METRIC_COUNT) {
    throw new Error(`Expected ${REQUIRED_FAO90_METRIC_COUNT} REQUIRED_FAO90_METRIC_CODES, got ${metricCodes.length}.`);
  }

  return metricCodes;
}
