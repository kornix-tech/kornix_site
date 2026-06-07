import { writeFileSync } from 'node:fs';

const apiBaseUrl = process.env.KORNIX_FRONTEND_SMOKE_API_BASE_URL || 'http://localhost:8001';
const username = process.env.KORNIX_FRONTEND_SMOKE_USERNAME || '';
const password = process.env.KORNIX_FRONTEND_SMOKE_PASSWORD || '';
const expectedFields = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_FIELDS || 37);
const expectedMetrics = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS || 13);
const outputJson = process.env.KORNIX_FRONTEND_SMOKE_OUTPUT_JSON || 'codex_reports/frontend_api_v2_sp37_live_smoke.json';

const requiredMetrics = [
  'air_temperature_daily_c',
  'relative_humidity_daily_pct',
  'wind_daily_mps',
  'eto_daily_mm',
  'shortwave_radiation_daily_mj_m2',
  'soil_total_capacity_water_mm',
  'soil_field_capacity_water_mm',
  'soil_wilting_point_capacity_water_mm',
  'soil_water_content_mm',
  'positive_temperature_sum_from_sowing_c',
  'crop_transpiration_daily_mm',
  'precipitation_effective_daily_mm',
  'irrigation_effective_daily_mm'
];

const cookieJar = new Map();
const blockers = [];

const report = {
  status: 'FAIL',
  apiBaseUrl,
  auth: {
    meBeforeLoginStatus: null,
    loginAttempted: false,
    loginSucceeded: false,
    meAfterLoginStatus: null
  },
  currentContext: {
    statusCode: null,
    currentAppliedCalculationRunId: null,
    frontendMode: null,
    submitAllowed: null,
    defaultMethodCode: null,
    serverDate: null,
    forecastEndDate: null
  },
  map: {
    statusCode: null,
    features: null,
    expectedFeatures: expectedFields,
    pass: false
  },
  profileTimeseries: {
    statusCode: null,
    metrics: null,
    expectedMetrics,
    requiredMetricsPresent: false,
    missingMetrics: [],
    shortwavePresent: false,
    pass: false
  },
  blockers
};

function saveReport() {
  writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
}

function endpoint(path) {
  return new URL(path, apiBaseUrl).toString();
}

function rememberCookies(headers) {
  const setCookieHeader = headers.get('set-cookie');
  if (!setCookieHeader) {
    return;
  }

  for (const part of setCookieHeader.split(/;\s*(?=[^=;]+=)/)) {
    const [nameValue] = part.split(';');
    const separatorIndex = nameValue.indexOf('=');
    if (separatorIndex > 0) {
      cookieJar.set(nameValue.slice(0, separatorIndex), nameValue.slice(separatorIndex + 1));
    }
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', headers.get('Accept') || 'application/json');
  const cookies = cookieHeader();
  if (cookies) {
    headers.set('Cookie', cookies);
  }

  const response = await fetch(endpoint(path), {
    ...options,
    headers
  });
  rememberCookies(response.headers);
  return response;
}

async function jsonOrNull(response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function metricCode(series) {
  return series?.long_name_for_code || series?.metricCode || series?.code || null;
}

function metricList(profile) {
  if (Array.isArray(profile?.metrics)) {
    return profile.metrics;
  }
  if (Array.isArray(profile?.series)) {
    return profile.series;
  }
  return [];
}

function fail(message) {
  blockers.push(message);
  throw new Error(message);
}

try {
  const meBefore = await request('/api/v1/me');
  report.auth.meBeforeLoginStatus = meBefore.status;

  if (meBefore.status === 401 || meBefore.status === 403) {
    if (!username || !password) {
      fail('KORNIX_FRONTEND_SMOKE_USERNAME/KORNIX_FRONTEND_SMOKE_PASSWORD unavailable; authenticated live frontend/backend API smoke could not be executed.');
    }

    const csrfResponse = await request('/api/v1/auth/csrf');
    if (!csrfResponse.ok) {
      fail(`CSRF bootstrap failed with HTTP ${csrfResponse.status}.`);
    }
    const csrfBody = await jsonOrNull(csrfResponse);
    const csrfToken = csrfBody?.csrfToken || csrfBody?.token;
    if (!csrfToken) {
      fail('CSRF bootstrap did not return a token.');
    }

    report.auth.loginAttempted = true;
    const loginResponse = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ username, password })
    });
    report.auth.loginSucceeded = loginResponse.ok;
    if (!loginResponse.ok) {
      fail(`Login failed with HTTP ${loginResponse.status}.`);
    }
  }

  const meAfter = await request('/api/v1/me');
  report.auth.meAfterLoginStatus = meAfter.status;
  if (!meAfter.ok) {
    fail(`/api/v1/me did not return authenticated user: HTTP ${meAfter.status}.`);
  }

  const contextResponse = await request('/api/v2/kornix/current-context');
  report.currentContext.statusCode = contextResponse.status;
  const context = await jsonOrNull(contextResponse);
  if (!contextResponse.ok || !context) {
    fail(`current-context failed with HTTP ${contextResponse.status}.`);
  }

  const currentAppliedCalculationRunId = context.currentAppliedCalculationRunId || null;
  report.currentContext.currentAppliedCalculationRunId = currentAppliedCalculationRunId;
  report.currentContext.frontendMode = context.frontendMode || null;
  report.currentContext.submitAllowed = Boolean(context.submitAllowed);
  report.currentContext.defaultMethodCode = context.defaultMethodCode || null;
  report.currentContext.serverDate = context.serverDate || null;
  report.currentContext.forecastEndDate = context.forecastEndDate || null;

  if (!currentAppliedCalculationRunId) {
    fail('currentAppliedCalculationRunId is empty; published SP37 run is not visible to frontend API.');
  }

  const methodCode =
    context.defaultMethodCode ||
    context.availableMethods?.find((method) => method?.methodCode)?.methodCode ||
    null;
  if (!methodCode) {
    fail('No methodCode is available from current-context.');
  }

  const day = context.serverDate || context.calculationWindow?.to || context.forecastEndDate;
  if (!day) {
    fail('No serverDate/calculationWindow day is available for map/profile smoke.');
  }

  const mapQuery = new URLSearchParams({
    calculationRunId: currentAppliedCalculationRunId,
    methodCode,
    day
  });
  const mapResponse = await request(`/api/v2/kornix/field-seasons/map?${mapQuery.toString()}`);
  report.map.statusCode = mapResponse.status;
  const mapBody = await jsonOrNull(mapResponse);
  const features = Array.isArray(mapBody?.features) ? mapBody.features : [];
  report.map.features = features.length;
  report.map.pass = mapResponse.ok && features.length === expectedFields;
  if (!report.map.pass) {
    fail(`Map smoke expected ${expectedFields} features, got ${features.length} with HTTP ${mapResponse.status}.`);
  }

  const fieldSeasonIds = features
    .map((feature) => feature?.properties?.fieldSeasonId)
    .filter(Boolean)
    .slice(0, 3);
  if (fieldSeasonIds.length === 0) {
    fail('Map smoke did not return fieldSeasonIds for profile smoke.');
  }

  const profileQuery = new URLSearchParams({
    calculationRunId: currentAppliedCalculationRunId,
    methodCode,
    fieldSeasonIds: fieldSeasonIds.join(','),
    aggregation: 'area_weighted_mean'
  });
  const profileResponse = await request(`/api/v2/kornix/water-regime/profile-timeseries?${profileQuery.toString()}`);
  report.profileTimeseries.statusCode = profileResponse.status;
  const profileBody = await jsonOrNull(profileResponse);
  const metrics = metricList(profileBody);
  const metricCodes = metrics.map(metricCode).filter(Boolean);
  report.profileTimeseries.metrics = metrics.length;
  report.profileTimeseries.missingMetrics = requiredMetrics.filter((code) => !metricCodes.includes(code));
  report.profileTimeseries.requiredMetricsPresent = report.profileTimeseries.missingMetrics.length === 0;
  report.profileTimeseries.shortwavePresent = metricCodes.includes('shortwave_radiation_daily_mj_m2');
  report.profileTimeseries.pass =
    profileResponse.ok &&
    metrics.length === expectedMetrics &&
    report.profileTimeseries.requiredMetricsPresent &&
    report.profileTimeseries.shortwavePresent;

  if (!report.profileTimeseries.pass) {
    fail(`Profile smoke expected ${expectedMetrics} metrics with all required metrics; got ${metrics.length}, missing ${report.profileTimeseries.missingMetrics.join(', ') || 'none'}.`);
  }

  report.status = 'PASS';
  saveReport();
  console.log('KORNIX frontend API v2 SP37 live smoke PASS.');
} catch (error) {
  report.status = 'FAIL';
  if (error instanceof Error && !blockers.includes(error.message)) {
    blockers.push(error.message);
  }
  saveReport();
  console.error('KORNIX frontend API v2 SP37 live smoke FAIL.');
  for (const blocker of blockers) {
    console.error(`- ${blocker}`);
  }
  process.exitCode = 1;
}
