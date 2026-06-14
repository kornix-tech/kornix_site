import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { REQUIRED_FAO90_METRIC_COUNT, readRequiredFao90MetricCodes } from './lib/fao90MetricContract.mjs';

const frontendBaseUrl = process.env.KORNIX_FRONTEND_UAT_BASE_URL || 'http://localhost:8080';
const apiBaseUrl = process.env.KORNIX_FRONTEND_UAT_API_BASE_URL || new URL('/api', frontendBaseUrl).toString();
const backendRepo = process.env.KORNIX_BACKEND_REPO || '/home/zenbook/meteo_stack_wsl_setup_v1_2/meteo_stack';
const expectedFields = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_FIELDS || 37);
const defaultExpectedMetrics = REQUIRED_FAO90_METRIC_COUNT;
const expectedMetrics = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS || defaultExpectedMetrics);
const allowDegradedMetricsOverride = process.env.KORNIX_FRONTEND_SMOKE_ALLOW_DEGRADED_METRICS === 'true';
const outputJson = process.env.KORNIX_FRONTEND_UAT_OUTPUT_JSON || 'codex_reports/frontend_pre_uat_browser_proxy_smoke.json';
const ephemeralUsername = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME || 'frontend_sp37_live_smoke_user';
const ephemeralEmail = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_EMAIL || 'frontend-sp37-live-smoke@example.local';
const ephemeralOrganizationSlug = 'SP';
const ephemeralRoles = ['viewer', 'farm_operator'];

if (!/^[a-z0-9_]+$/.test(ephemeralUsername)) {
  throw new Error('KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME must contain only lowercase latin letters, digits, and underscores.');
}

const requiredMetrics = readRequiredFao90MetricCodes();

const cookieJar = new Map();
const blockers = [];
let shouldCleanupEphemeralUser = false;
let credentials = {
  source: process.env.KORNIX_FRONTEND_SMOKE_USERNAME && process.env.KORNIX_FRONTEND_SMOKE_PASSWORD
    ? 'external_env'
    : 'not_available',
  username: process.env.KORNIX_FRONTEND_SMOKE_USERNAME || '',
  password: process.env.KORNIX_FRONTEND_SMOKE_PASSWORD || ''
};

const report = {
  status: 'FAIL',
  frontendBaseUrl,
  apiBaseUrl,
  staticFrontend: 'FAIL',
  sameOriginApiHealth: 'FAIL',
  apiRouteReturnedJsonNotHtml: false,
  credentialsGate: {
    credentialSource: credentials.source,
    externalEnv: {
      KORNIX_FRONTEND_SMOKE_USERNAME: Boolean(process.env.KORNIX_FRONTEND_SMOKE_USERNAME),
      KORNIX_FRONTEND_SMOKE_PASSWORD: Boolean(process.env.KORNIX_FRONTEND_SMOKE_PASSWORD)
    },
    ephemeralBackendUser: {
      attempted: false,
      username: ephemeralUsername,
      organizationSlug: ephemeralOrganizationSlug,
      roles: ephemeralRoles,
      createdOrUpdated: 'NOT_RUN',
      passwordGeneratedInMemory: false,
      passwordWrittenToReports: false,
      cleanupSessionsRevoked: 'NOT_RUN',
      cleanupUserDeactivated: 'NOT_RUN'
    },
    valuesRedacted: true
  },
  auth: {
    loginAttempted: false,
    loginSucceeded: false,
    meStatusCode: null,
    organizationCode: null
  },
  currentContext: {
    statusCode: null,
    currentAppliedCalculationRunId: null,
    defaultMethodCode: null,
    serverDate: null
  },
  map: {
    statusCode: null,
    features: null,
    expectedFeatures: expectedFields
  },
  profileTimeseries: {
    statusCode: null,
    metrics: null,
    defaultExpectedMetrics,
    expectedMetrics,
    effectiveExpectedMetrics: expectedMetrics,
    degradedExpectedMetricsOverride: expectedMetrics < defaultExpectedMetrics,
    degradedExpectedMetricsOverrideAllowed: allowDegradedMetricsOverride,
    requiredMetricsPresent: false,
    shortwavePresent: false,
    missingMetrics: []
  },
  mockModeUsed: false,
  blockers
};

function saveReport() {
  writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
}

function apiPath(path) {
  return new URL(path.replace(/^\//, ''), `${apiBaseUrl.replace(/\/$/, '')}/`).toString();
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

async function request(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', headers.get('Accept') || 'application/json');
  const cookies = cookieHeader();
  if (cookies) {
    headers.set('Cookie', cookies);
  }
  const response = await fetch(url, { ...options, headers });
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

function fail(message) {
  blockers.push(message);
  throw new Error(message);
}

function runBackendCommand(args, options = {}) {
  return spawnSync('docker', ['compose', ...args], {
    cwd: backendRepo,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
}

function provisionEphemeralUser() {
  if (credentials.source === 'external_env') {
    return;
  }
  report.credentialsGate.credentialSource = 'ephemeral_backend_user';
  report.credentialsGate.ephemeralBackendUser.attempted = true;
  report.credentialsGate.ephemeralBackendUser.passwordGeneratedInMemory = true;
  if (!existsSync(backendRepo)) {
    report.credentialsGate.ephemeralBackendUser.createdOrUpdated = 'FAIL';
    fail(`Backend repo is unavailable: ${backendRepo}.`);
  }

  const generatedPassword = randomBytes(36).toString('base64url');
  const result = runBackendCommand(
    [
      'exec',
      '-T',
      '-e',
      'KORNIX_BOOTSTRAP_PASSWORD',
      'app',
      'python',
      '-m',
      'meteo_pipeline.ops.create_kornix_user',
      '--organization-slug',
      ephemeralOrganizationSlug,
      '--username',
      ephemeralUsername,
      '--email',
      ephemeralEmail,
      '--roles',
      ephemeralRoles.join(',')
    ],
    { env: { KORNIX_BOOTSTRAP_PASSWORD: generatedPassword } }
  );
  if (result.status !== 0) {
    report.credentialsGate.ephemeralBackendUser.createdOrUpdated = 'FAIL';
    fail(`Ephemeral backend user provisioning failed with exit ${result.status}.`);
  }
  report.credentialsGate.ephemeralBackendUser.createdOrUpdated = 'PASS';
  credentials = { source: 'ephemeral_backend_user', username: ephemeralUsername, password: generatedPassword };
  shouldCleanupEphemeralUser = true;
}

function cleanupEphemeralUser() {
  if (!shouldCleanupEphemeralUser) {
    return;
  }

  const sessionsResult = runBackendCommand([
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'meteo_app',
    '-d',
    'meteo_pipeline',
    '-Atc',
    `DELETE FROM meteo.kornix_user_sessions WHERE user_id IN (SELECT user_id FROM meteo.kornix_users WHERE username = '${ephemeralUsername}');`
  ]);
  report.credentialsGate.ephemeralBackendUser.cleanupSessionsRevoked = sessionsResult.status === 0 ? 'PASS' : 'FAIL';

  const deactivateResult = runBackendCommand([
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'meteo_app',
    '-d',
    'meteo_pipeline',
    '-Atc',
    `UPDATE meteo.kornix_users SET is_active = false, updated_at = now() WHERE username = '${ephemeralUsername}';
SELECT COALESCE(bool_and(is_active = false), false) FROM meteo.kornix_users WHERE username = '${ephemeralUsername}';`
  ]);
  report.credentialsGate.ephemeralBackendUser.cleanupUserDeactivated =
    deactivateResult.status === 0 && (deactivateResult.stdout || '').trim().endsWith('t') ? 'PASS' : 'FAIL';

  if (
    report.credentialsGate.ephemeralBackendUser.cleanupSessionsRevoked !== 'PASS' ||
    report.credentialsGate.ephemeralBackendUser.cleanupUserDeactivated !== 'PASS'
  ) {
    blockers.push('Ephemeral backend smoke user cleanup failed.');
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

try {
  const staticResponse = await fetch(new URL('/healthz', frontendBaseUrl));
  report.staticFrontend = staticResponse.ok ? 'PASS' : 'FAIL';
  if (!staticResponse.ok) {
    fail(`Frontend static health failed with HTTP ${staticResponse.status}.`);
  }

  const healthResponse = await request(apiPath('/v2/health'));
  const healthContentType = healthResponse.headers.get('content-type') || '';
  const healthBody = await healthResponse.clone().text();
  report.sameOriginApiHealth = healthResponse.ok ? 'PASS' : 'FAIL';
  report.apiRouteReturnedJsonNotHtml = healthContentType.includes('application/json') && !healthBody.includes('<!doctype html');
  if (!healthResponse.ok || !report.apiRouteReturnedJsonNotHtml) {
    fail(`Same-origin /api/v2/health did not return backend JSON: HTTP ${healthResponse.status}.`);
  }

  provisionEphemeralUser();

  const csrfResponse = await request(apiPath('/v2/auth/csrf'));
  const csrfBody = await jsonOrNull(csrfResponse);
  const csrfToken = csrfBody?.csrfToken || csrfBody?.token;
  if (!csrfResponse.ok || !csrfToken) {
    fail(`CSRF bootstrap failed through frontend origin with HTTP ${csrfResponse.status}.`);
  }

  report.auth.loginAttempted = true;
  const loginResponse = await request(apiPath('/v2/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ username: credentials.username, password: credentials.password })
  });
  report.auth.loginSucceeded = loginResponse.ok;
  if (!loginResponse.ok) {
    fail(`Login through frontend origin failed with HTTP ${loginResponse.status}.`);
  }

  const meResponse = await request(apiPath('/v2/me'));
  const meBody = await jsonOrNull(meResponse);
  report.auth.meStatusCode = meResponse.status;
  report.auth.organizationCode = meBody?.organizationCode || meBody?.organization?.code || null;
  if (!meResponse.ok || report.auth.organizationCode !== 'SP') {
    fail(`/api/v2/me through frontend origin did not return SP organization: HTTP ${meResponse.status}.`);
  }

  const contextResponse = await request(apiPath('/v2/kornix/current-context?seasonYear=2026'));
  const context = await jsonOrNull(contextResponse);
  report.currentContext.statusCode = contextResponse.status;
  report.currentContext.currentAppliedCalculationRunId = context?.currentAppliedCalculationRunId || null;
  report.currentContext.defaultMethodCode = context?.defaultMethodCode || null;
  report.currentContext.serverDate = context?.serverDate || null;
  if (!contextResponse.ok || !report.currentContext.currentAppliedCalculationRunId || !report.currentContext.defaultMethodCode) {
    fail(`current-context through frontend origin failed with HTTP ${contextResponse.status}.`);
  }

  const mapQuery = new URLSearchParams({
    calculationRunId: report.currentContext.currentAppliedCalculationRunId,
    methodCode: report.currentContext.defaultMethodCode,
    day: report.currentContext.serverDate
  });
  const mapResponse = await request(apiPath(`/v2/kornix/field-seasons/map?${mapQuery.toString()}`));
  const mapBody = await jsonOrNull(mapResponse);
  const features = Array.isArray(mapBody?.features) ? mapBody.features : [];
  report.map.statusCode = mapResponse.status;
  report.map.features = features.length;
  if (!mapResponse.ok || features.length !== expectedFields) {
    fail(`Map through frontend origin expected ${expectedFields} features, got ${features.length}.`);
  }

  const fieldSeasonIds = features.map((feature) => feature?.properties?.fieldSeasonId).filter(Boolean).slice(0, 3);
  const profileQuery = new URLSearchParams({
    calculationRunId: report.currentContext.currentAppliedCalculationRunId,
    methodCode: report.currentContext.defaultMethodCode,
    fieldSeasonIds: fieldSeasonIds.join(','),
    aggregation: 'area_weighted_mean'
  });
  const profileResponse = await request(apiPath(`/v2/kornix/water-regime/profile-timeseries?${profileQuery.toString()}`));
  const profileBody = await jsonOrNull(profileResponse);
  const metrics = metricList(profileBody);
  const metricCodes = metrics.map(metricCode).filter(Boolean);
  report.profileTimeseries.statusCode = profileResponse.status;
  report.profileTimeseries.metrics = metrics.length;
  report.profileTimeseries.missingMetrics = requiredMetrics.filter((code) => !metricCodes.includes(code));
  report.profileTimeseries.requiredMetricsPresent = report.profileTimeseries.missingMetrics.length === 0;
  report.profileTimeseries.shortwavePresent = metricCodes.includes('shortwave_radiation_daily_mj_m2');
  if (expectedMetrics < defaultExpectedMetrics && !allowDegradedMetricsOverride) {
    fail(`KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS=${expectedMetrics} is below production FAO90 contract ${defaultExpectedMetrics}. Set KORNIX_FRONTEND_SMOKE_ALLOW_DEGRADED_METRICS=true only for explicit debug runs.`);
  }
  if (
    !profileResponse.ok ||
    metrics.length !== expectedMetrics ||
    !report.profileTimeseries.requiredMetricsPresent ||
    !report.profileTimeseries.shortwavePresent
  ) {
    fail(`Profile through frontend origin expected ${expectedMetrics} metrics with required metrics.`);
  }

  report.status = 'PASS';
  cleanupEphemeralUser();
  if (blockers.length > 0) {
    report.status = 'FAIL';
    process.exitCode = 1;
  }
  saveReport();
  if (report.status === 'PASS') {
    console.log('KORNIX frontend pre-UAT browser/proxy smoke PASS.');
  } else {
    console.error('KORNIX frontend pre-UAT browser/proxy smoke FAIL.');
    for (const blocker of blockers) {
      console.error(`- ${blocker}`);
    }
  }
} catch (error) {
  report.status = 'FAIL';
  if (error instanceof Error && !blockers.includes(error.message)) {
    blockers.push(error.message);
  }
  cleanupEphemeralUser();
  saveReport();
  console.error('KORNIX frontend pre-UAT browser/proxy smoke FAIL.');
  for (const blocker of blockers) {
    console.error(`- ${blocker}`);
  }
  process.exitCode = 1;
}
