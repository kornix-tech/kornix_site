import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { REQUIRED_FAO90_METRIC_COUNT, readRequiredFao90MetricCodes } from './lib/fao90MetricContract.mjs';

const apiBaseUrl = process.env.KORNIX_FRONTEND_SMOKE_API_BASE_URL || 'http://localhost:8001';
const expectedFields = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_FIELDS || 37);
const defaultExpectedMetrics = REQUIRED_FAO90_METRIC_COUNT;
const expectedMetrics = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS || defaultExpectedMetrics);
const allowDegradedMetricsOverride = process.env.KORNIX_FRONTEND_SMOKE_ALLOW_DEGRADED_METRICS === 'true';
const outputJson = process.env.KORNIX_FRONTEND_SMOKE_OUTPUT_JSON || 'codex_reports/frontend_api_v2_sp37_live_smoke.json';
const backendRepo = process.env.KORNIX_FRONTEND_SMOKE_BACKEND_REPO || '/home/zenbook/meteo_stack_wsl_setup_v1_2/meteo_stack';
const ephemeralUsername = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME || 'frontend_sp37_live_smoke_user';
const ephemeralEmail = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_EMAIL || 'frontend-sp37-live-smoke@example.local';
const ephemeralOrganizationSlug = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_ORGANIZATION_SLUG || 'SP';
const ephemeralRoles = ['viewer', 'farm_operator'];
if (!/^[a-z0-9_]+$/.test(ephemeralUsername)) {
  throw new Error('KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME must contain only lowercase latin letters, digits, and underscores.');
}

const requiredMetrics = readRequiredFao90MetricCodes();

const cookieJar = new Map();
const blockers = [];
let resolvedCredentials = {
  username: process.env.KORNIX_FRONTEND_SMOKE_USERNAME || '',
  password: process.env.KORNIX_FRONTEND_SMOKE_PASSWORD || '',
  source: process.env.KORNIX_FRONTEND_SMOKE_USERNAME && process.env.KORNIX_FRONTEND_SMOKE_PASSWORD
    ? 'external_env'
    : 'not_available'
};
let shouldCleanupEphemeralUser = false;

const report = {
  status: 'FAIL',
  apiBaseUrl,
  credentialSource: resolvedCredentials.source,
  credentialsGate: {
    status: 'FAIL',
    credentialSource: resolvedCredentials.source,
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
    valuesRedacted: true,
    blockers: []
  },
  auth: {
    meBeforeLoginStatus: null,
    loginAttempted: false,
    loginSucceeded: false,
    meAfterLoginStatus: null,
    organizationCode: null
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
  calculationRun: {
    statusCode: null,
    pass: false
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
    defaultExpectedMetrics,
    expectedMetrics,
    effectiveExpectedMetrics: expectedMetrics,
    degradedExpectedMetricsOverride: expectedMetrics < defaultExpectedMetrics,
    degradedExpectedMetricsOverrideAllowed: allowDegradedMetricsOverride,
    requiredMetricsPresent: false,
    missingMetrics: [],
    shortwavePresent: false,
    pass: false
  },
  blockers
};

function saveReport() {
  report.credentialsGate.blockers = [...blockers];
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

function runBackendCommand(args, options = {}) {
  return spawnSync('docker', ['compose', ...args], {
    cwd: backendRepo,
    env: {
      ...process.env,
      ...(options.env || {})
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
}

function provisionEphemeralUser() {
  report.credentialsGate.ephemeralBackendUser.attempted = true;
  report.credentialsGate.ephemeralBackendUser.passwordGeneratedInMemory = true;
  report.credentialSource = 'ephemeral_backend_user';
  report.credentialsGate.credentialSource = 'ephemeral_backend_user';

  if (!existsSync(backendRepo)) {
    report.credentialsGate.ephemeralBackendUser.createdOrUpdated = 'FAIL';
    fail(`Backend repo for ephemeral smoke user is unavailable: ${backendRepo}.`);
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
    const stderr = (result.stderr || '').trim();
    fail(`Ephemeral backend user provisioning failed with exit ${result.status}${stderr ? `: ${stderr}` : '.'}`);
  }

  report.credentialsGate.ephemeralBackendUser.createdOrUpdated = 'PASS';
  report.credentialsGate.status = 'PASS';
  resolvedCredentials = {
    username: ephemeralUsername,
    password: generatedPassword,
    source: 'ephemeral_backend_user'
  };
  shouldCleanupEphemeralUser = true;
}

function resolveCredentials() {
  if (resolvedCredentials.source === 'external_env') {
    report.credentialsGate.status = 'PASS';
    return;
  }
  provisionEphemeralUser();
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
    `
WITH target AS (
  SELECT user_id FROM meteo.kornix_users WHERE username = '${ephemeralUsername}'
),
deleted AS (
  DELETE FROM meteo.kornix_user_sessions
  WHERE user_id IN (SELECT user_id FROM target)
  RETURNING 1
)
SELECT count(*) FROM deleted;
`
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
    `
UPDATE meteo.kornix_users
SET is_active = false,
    updated_at = now()
WHERE username = '${ephemeralUsername}';
SELECT COALESCE(bool_and(is_active = false), false)
FROM meteo.kornix_users
WHERE username = '${ephemeralUsername}';
`
  ]);
  report.credentialsGate.ephemeralBackendUser.cleanupUserDeactivated =
    deactivateResult.status === 0 && (deactivateResult.stdout || '').trim().endsWith('t') ? 'PASS' : 'FAIL';

  if (
    report.credentialsGate.ephemeralBackendUser.cleanupSessionsRevoked !== 'PASS' ||
    report.credentialsGate.ephemeralBackendUser.cleanupUserDeactivated !== 'PASS'
  ) {
    const cleanupMessage = 'Ephemeral backend smoke user cleanup failed; temporary user/session cleanup is not proven.';
    if (!blockers.includes(cleanupMessage)) {
      blockers.push(cleanupMessage);
    }
  }
}

try {
  resolveCredentials();

  const meBefore = await request('/api/v2/me');
  report.auth.meBeforeLoginStatus = meBefore.status;

  if (meBefore.status === 401 || meBefore.status === 403) {
    const csrfResponse = await request('/api/v2/auth/csrf');
    if (!csrfResponse.ok) {
      fail(`CSRF bootstrap failed with HTTP ${csrfResponse.status}.`);
    }
    const csrfBody = await jsonOrNull(csrfResponse);
    const csrfToken = csrfBody?.csrfToken || csrfBody?.token;
    if (!csrfToken) {
      fail('CSRF bootstrap did not return a token.');
    }

    report.auth.loginAttempted = true;
    const loginResponse = await request('/api/v2/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ username: resolvedCredentials.username, password: resolvedCredentials.password })
    });
    report.auth.loginSucceeded = loginResponse.ok;
    if (!loginResponse.ok) {
      fail(`Login failed with HTTP ${loginResponse.status}.`);
    }
  }

  const meAfter = await request('/api/v2/me');
  report.auth.meAfterLoginStatus = meAfter.status;
  const meAfterBody = await jsonOrNull(meAfter);
  report.auth.organizationCode = meAfterBody?.organizationCode || meAfterBody?.organization?.code || null;
  if (!meAfter.ok) {
    fail(`/api/v2/me did not return authenticated user: HTTP ${meAfter.status}.`);
  }
  if (report.auth.organizationCode && report.auth.organizationCode !== 'SP') {
    fail(`/api/v2/me returned unexpected organization scope: ${report.auth.organizationCode}.`);
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

  const runResponse = await request(
    `/api/v2/kornix/water-regime/calculation-runs/${encodeURIComponent(currentAppliedCalculationRunId)}`
  );
  report.calculationRun.statusCode = runResponse.status;
  report.calculationRun.pass = runResponse.ok;
  if (!report.calculationRun.pass) {
    fail(`calculation-run detail failed with HTTP ${runResponse.status}.`);
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
  if (expectedMetrics < defaultExpectedMetrics && !allowDegradedMetricsOverride) {
    fail(`KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS=${expectedMetrics} is below production FAO90 contract ${defaultExpectedMetrics}. Set KORNIX_FRONTEND_SMOKE_ALLOW_DEGRADED_METRICS=true only for explicit debug runs.`);
  }
  report.profileTimeseries.pass =
    profileResponse.ok &&
    metrics.length === expectedMetrics &&
    report.profileTimeseries.requiredMetricsPresent &&
    report.profileTimeseries.shortwavePresent;

  if (!report.profileTimeseries.pass) {
    fail(`Profile smoke expected ${expectedMetrics} metrics with all required metrics; got ${metrics.length}, missing ${report.profileTimeseries.missingMetrics.join(', ') || 'none'}.`);
  }

  if (blockers.length === 0) {
    report.status = 'PASS';
  }
  cleanupEphemeralUser();
  if (blockers.length > 0) {
    report.status = 'FAIL';
    process.exitCode = 1;
  }
  saveReport();
  if (report.status === 'PASS') {
    console.log('KORNIX frontend API v2 SP37 live smoke PASS.');
  } else {
    console.error('KORNIX frontend API v2 SP37 live smoke FAIL.');
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
  console.error('KORNIX frontend API v2 SP37 live smoke FAIL.');
  for (const blocker of blockers) {
    console.error(`- ${blocker}`);
  }
  process.exitCode = 1;
}
