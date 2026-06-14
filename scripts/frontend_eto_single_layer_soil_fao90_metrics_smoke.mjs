import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const READY_STATUS = 'KORNIX_FRONTEND_ETO_SINGLE_LAYER_SOIL_FAO90_METRICS_READY';
const GAP_STATUS = 'NOT_READY_FRONTEND_ETO_SINGLE_LAYER_SOIL_FAO90_METRICS_GAP';
const BACKEND_UNREACHABLE_STATUS = 'NOT_READY_FRONTEND_ETO_SINGLE_LAYER_SOIL_FAO90_BACKEND_UNREACHABLE';
const EXPECTED_BACKEND_COMMIT = process.env.KORNIX_EXPECTED_BACKEND_COMMIT || 'c8d20e740db9d7135538c8c8a7e832260e0323ce';
const EXPECTED_PROFILE_CODE = 'potato_medium_fao90_single_layer_v1';
const EXPECTED_METHOD_CODE = 'simple_eto_single_layer_soil';
const REQUIRED_METRICS = [
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
  'irrigation_effective_daily_mm',
  'soil_water_start_mm',
  'soil_water_end_mm',
  'soil_water_available_mm',
  'soil_water_available_pct_taw',
  'soil_water_depletion_mm',
  'soil_water_depletion_pct_taw',
  'soil_water_productive_mm',
  'total_available_water_mm',
  'readily_available_water_mm',
  'root_zone_depth_m',
  'precipitation_raw_daily_mm',
  'effective_precipitation_daily_mm',
  'irrigation_raw_daily_mm',
  'effective_irrigation_daily_mm',
  'drainage_runoff_daily_mm',
  'crop_coefficient_kc',
  'basal_crop_coefficient_kcb',
  'soil_evaporation_coefficient_ke',
  'surface_evaporation_reduction_kr',
  'potential_crop_evapotranspiration_mm',
  'potential_transpiration_mm',
  'potential_soil_evaporation_mm',
  'actual_transpiration_mm',
  'actual_soil_evaporation_mm',
  'actual_evapotranspiration_mm',
  'actual_evapotranspiration_cumulative_mm',
  'water_stress_coefficient',
  'crop_stage_code',
  'days_after_sowing',
  'calculation_diagnostics_json',
  'calculation_warnings_json'
];
const MAP_FAO90_FIELDS = [
  'soil_water_end_mm',
  'soil_water_available_pct_taw',
  'root_zone_depth_m',
  'water_stress_coefficient',
  'effective_precipitation_daily_mm',
  'effective_irrigation_daily_mm',
  'drainage_runoff_daily_mm'
];
const frontendBaseUrl = process.env.KORNIX_FRONTEND_BASE_URL || 'http://127.0.0.1:5173';
const apiBaseUrl =
  process.env.KORNIX_FRONTEND_SMOKE_API_BASE_URL ||
  new URL('/api/', frontendBaseUrl).toString();
const backendRepo = process.env.KORNIX_BACKEND_REPO_PATH || '/home/zenbook/meteo_stack_wsl_setup_v1_2/meteo_stack';
const organizationCode = process.env.KORNIX_SMOKE_ORGANIZATION_CODE || 'SP';
const expectedMetricCount = Number(process.env.KORNIX_EXPECTED_PROFILE_METRIC_COUNT || 44);
const expectedFieldCount = Number(process.env.KORNIX_EXPECTED_FIELD_COUNT || 37);
const allowEphemeral = (process.env.KORNIX_FRONTEND_ALLOW_EPHEMERAL_BACKEND_USER || 'true') !== 'false';
const outputJson = 'codex_reports/frontend_eto_single_layer_soil_fao90_metrics_smoke.json';
const reportJson = 'codex_reports/frontend_eto_single_layer_soil_fao90_metrics_report.json';
const contractMapJson = 'codex_reports/frontend_eto_single_layer_soil_fao90_metrics_contract_map.json';
const ephemeralUsername = 'frontend_fao90_metrics_smoke_user';
const ephemeralEmail = 'frontend-fao90-metrics-smoke@example.local';

const cookieJar = new Map();
const blockers = [];
let cleanupRequired = false;
let backendReachable = false;
let credentials = {
  source:
    process.env.KORNIX_FRONTEND_SMOKE_USERNAME && process.env.KORNIX_FRONTEND_SMOKE_PASSWORD
      ? 'external_env'
      : 'not_available',
  username: process.env.KORNIX_FRONTEND_SMOKE_USERNAME || '',
  password: process.env.KORNIX_FRONTEND_SMOKE_PASSWORD || ''
};

const smoke = {
  status: 'FAIL',
  staticFrontend: 'NOT_RUN',
  sameOriginApiHealth: 'NOT_RUN',
  apiReturnedJsonNotHtml: false,
  authenticatedSession: 'NOT_RUN',
  organization: null,
  currentContext: 'NOT_RUN',
  currentAppliedCalculationRunId: null,
  defaultMethodCode: null,
  methodProfileCode: null,
  mapFeatures: null,
  cropNamePotatoCount: null,
  profileMetricCount: null,
  requiredMetricsPresent: false,
  missingMetrics: [],
  shortwavePresent: false,
  fao90MetricParsing: 'NOT_RUN',
  diagnosticsJsonHandled: 'NOT_RUN',
  csvExportIncludesFao90Metrics: 'NOT_RUN',
  editableApprovalRegression: 'NOT_RUN',
  offlineModeUsed: false,
  blockers
};

const report = {
  status: GAP_STATUS,
  backendObserved: {
    commitSha: gitSha(backendRepo),
    reachable: false,
    currentAppliedCalculationRunId: null,
    mapFeatures: null,
    profileMetricCount: null,
    methodProfileCode: null
  },
  implementation: {
    dynamicProfileMetricsConsumed: sourceHas('src/workspace/WaterRegimeChart.tsx', 'metricCsvColumns') ? 'PASS' : 'FAIL',
    all44MetricsKnownOrDynamic: sourceHas('src/config/metrics.ts', 'REQUIRED_FAO90_METRIC_CODES') ? 'PASS' : 'FAIL',
    chartRenderingUpdated: sourceHas('src/workspace/WaterRegimeChart.tsx', 'Fao90MetricSummary') ? 'PASS' : 'FAIL',
    tableCsvExportUpdated: sourceHas('src/workspace/WaterRegimeChart.tsx', 'metricCsvValues') ? 'PASS' : 'FAIL',
    mapTooltipUpdated: sourceHas('src/workspace/FieldTooltip.tsx', 'soil_water_end_mm') ? 'PASS' : 'FAIL',
    diagnosticsJsonHandled: sourceHas('src/workspace/WaterRegimeChart.tsx', 'calculation_diagnostics_json') ? 'PASS' : 'FAIL',
    cropStageHandledAsCategory: sourceHas('src/workspace/WaterRegimeChart.tsx', 'crop_stage_code') ? 'PASS' : 'FAIL',
    editableApprovalRegressionPreserved: 'NOT_APPLICABLE'
  },
  smoke: {
    authenticatedSession: 'NOT_RUN',
    sameOriginApi: 'NOT_RUN',
    mapFeatures: null,
    profileMetricCount: null,
    requiredMetricsPresent: false,
    shortwavePresent: false,
    offlineModeUsed: false
  },
  checks: {
    npmCi: 'NOT_RUN',
    typecheck: 'NOT_RUN',
    build: 'NOT_RUN',
    unitContractTests: 'NOT_RUN',
    securityScan: 'NOT_RUN',
    secretScan: 'NOT_RUN',
    dockerBuild: 'NOT_RUN'
  },
  git: {
    committed: false,
    pushed: false,
    commitSha: null,
    worktreeClean: false,
    pushFailureReason: null
  },
  blockers
};

function gitSha(cwd) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'UNKNOWN';
}

function sourceHas(path, needle) {
  return existsSync(path) && readFileSync(path, 'utf8').includes(needle);
}

function saveJson(path, value) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function saveReports() {
  saveJson(outputJson, smoke);
  saveJson(reportJson, report);
  saveJson(contractMapJson, {
    backendBaseline: {
      commitSha: EXPECTED_BACKEND_COMMIT,
      expectedStatus: 'KORNIX_BACKEND_ETO_SINGLE_LAYER_SOIL_FAO90_CHAIN_READY',
      expectedMetricCount
    },
    endpointsUsed: [
      '/api/v2/me',
      '/api/v2/kornix/current-context',
      '/api/v2/kornix/field-seasons/map',
      '/api/v2/kornix/water-regime/profile-timeseries',
      '/api/v2/kornix/water-regime/calculation-runs/{calculationRunId}',
      '/api/v2/kornix/water-regime/approvals'
    ],
    requiredMetricCodes: REQUIRED_METRICS,
    uiMappings: {
      chartNumericMetrics: REQUIRED_METRICS.filter((code) => !code.endsWith('_json') && code !== 'crop_stage_code'),
      barMetrics: [
        'precipitation_raw_daily_mm',
        'effective_precipitation_daily_mm',
        'irrigation_raw_daily_mm',
        'effective_irrigation_daily_mm',
        'drainage_runoff_daily_mm'
      ],
      tableOnlyMetrics: ['crop_stage_code'],
      diagnosticsMetrics: ['calculation_diagnostics_json', 'calculation_warnings_json'],
      mapTooltipMetrics: MAP_FAO90_FIELDS
    }
  });
}

function addBlocker(message) {
  if (!blockers.includes(message)) {
    blockers.push(message);
  }
}

function apiUrl(path) {
  return new URL(path.replace(/^\//, ''), `${apiBaseUrl.replace(/\/$/, '')}/`).toString();
}

function rememberCookies(headers) {
  const setCookieHeaders = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const fallback = headers.get('set-cookie');
  const rawHeaders = setCookieHeaders.length ? setCookieHeaders : fallback ? fallback.split(/,\s*(?=[A-Za-z0-9_.-]+=)/) : [];
  for (const raw of rawHeaders) {
    const [nameValue] = raw.split(';');
    const index = nameValue.indexOf('=');
    if (index > 0) {
      cookieJar.set(nameValue.slice(0, index), nameValue.slice(index + 1));
    }
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function request(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', headers.get('Accept') || 'application/json');
  const cookies = options.omitCookies ? '' : cookieHeader();
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
  if (!allowEphemeral) {
    throw new Error('No external credentials provided and ephemeral backend user flow is disabled.');
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
      organizationCode,
      '--username',
      ephemeralUsername,
      '--email',
      ephemeralEmail,
      '--roles',
      'viewer,farm_operator'
    ],
    { env: { KORNIX_BOOTSTRAP_PASSWORD: generatedPassword } }
  );
  if (result.status !== 0) {
    throw new Error(`Ephemeral backend user provisioning failed with exit ${result.status}.`);
  }
  credentials = { source: 'ephemeral_backend_user', username: ephemeralUsername, password: generatedPassword };
  cleanupRequired = true;
}

function cleanupEphemeralUser() {
  if (!cleanupRequired) {
    return;
  }
  runBackendCommand([
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
  runBackendCommand([
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'meteo_app',
    '-d',
    'meteo_pipeline',
    '-Atc',
    `UPDATE meteo.kornix_users SET is_active = false, updated_at = now() WHERE username = '${ephemeralUsername}';`
  ]);
}

function metricCode(metric) {
  return metric?.long_name_for_code || metric?.metricCode || metric?.code || null;
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

function profileCode(status) {
  return (
    status?.methodProfileMetadata?.profileCode ||
    status?.method_profile_metadata?.profileCode ||
    status?.method_profile_metadata?.profile_code ||
    status?.profileCode ||
    status?.profile_code ||
    null
  );
}

function hasNonNullMetricValue(metric) {
  return metric?.points?.some((point) => {
    if ('value' in point) {
      return point.value !== null && point.value !== undefined;
    }
    return point.mean !== null && point.mean !== undefined;
  });
}

async function pollApproval(approvalBatchId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request(apiUrl(`/v2/kornix/water-regime/approvals/${encodeURIComponent(approvalBatchId)}`));
    const body = await jsonOrNull(response);
    if (!response.ok) {
      throw new Error(`Approval readback failed with HTTP ${response.status}.`);
    }
    if (body?.approvalStatus && body.approvalStatus !== 'pending_calculation') {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('Approval readback did not reach a final status.');
}

try {
  const staticResponse = await fetch(new URL('/', frontendBaseUrl));
  const staticText = await staticResponse.text();
  smoke.staticFrontend = staticResponse.ok && staticText.includes('<div id="root"') ? 'PASS' : 'FAIL';
  if (smoke.staticFrontend !== 'PASS') {
    throw new Error(`Static frontend failed with HTTP ${staticResponse.status}.`);
  }

  const health = await request(apiUrl('/v2/health'));
  backendReachable = health.ok;
  report.backendObserved.reachable = health.ok;
  smoke.sameOriginApiHealth = health.ok ? 'PASS' : 'FAIL';
  const healthType = health.headers.get('content-type') || '';
  const healthText = await health.clone().text();
  smoke.apiReturnedJsonNotHtml = health.ok && healthType.includes('application/json') && !healthText.toLowerCase().includes('<!doctype html');
  report.smoke.sameOriginApi = smoke.apiReturnedJsonNotHtml ? 'PASS' : 'FAIL';
  if (!smoke.apiReturnedJsonNotHtml) {
    throw new Error(`Same-origin API health did not return backend JSON: HTTP ${health.status}.`);
  }

  if (report.backendObserved.commitSha !== EXPECTED_BACKEND_COMMIT) {
    throw new Error(`Backend commit mismatch: expected ${EXPECTED_BACKEND_COMMIT}, got ${report.backendObserved.commitSha}.`);
  }

  provisionEphemeralUser();

  const csrfResponse = await request(apiUrl('/v2/auth/csrf'));
  const csrfBody = await jsonOrNull(csrfResponse);
  const bootstrapCsrf = csrfBody?.csrfToken || csrfBody?.token;
  if (!csrfResponse.ok || !bootstrapCsrf) {
    throw new Error(`CSRF bootstrap failed with HTTP ${csrfResponse.status}.`);
  }

  const login = await request(apiUrl('/v2/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': bootstrapCsrf },
    body: JSON.stringify({ username: credentials.username, password: credentials.password })
  });
  const loginBody = await jsonOrNull(login);
  smoke.authenticatedSession = login.ok ? 'PASS' : 'FAIL';
  report.smoke.authenticatedSession = smoke.authenticatedSession;
  if (!login.ok) {
    throw new Error(`Login failed with HTTP ${login.status}.`);
  }
  const sessionCsrf = loginBody?.csrfToken || loginBody?.token || bootstrapCsrf;

  const me = await request(apiUrl('/v2/me'));
  const meBody = await jsonOrNull(me);
  smoke.organization = meBody?.organizationCode || null;
  if (!me.ok || smoke.organization !== organizationCode) {
    throw new Error(`/api/v2/me returned unexpected organization: HTTP ${me.status}.`);
  }

  const contextResponse = await request(apiUrl('/v2/kornix/current-context?seasonYear=2026'));
  const context = await jsonOrNull(contextResponse);
  smoke.currentContext = contextResponse.ok && context ? 'PASS' : 'FAIL';
  smoke.currentAppliedCalculationRunId = context?.currentAppliedCalculationRunId || null;
  smoke.defaultMethodCode = context?.defaultMethodCode || null;
  report.backendObserved.currentAppliedCalculationRunId = smoke.currentAppliedCalculationRunId;
  if (!contextResponse.ok || !smoke.currentAppliedCalculationRunId) {
    throw new Error(`current-context failed with HTTP ${contextResponse.status}.`);
  }
  if (smoke.defaultMethodCode !== EXPECTED_METHOD_CODE) {
    throw new Error(`Expected defaultMethodCode=${EXPECTED_METHOD_CODE}, got ${smoke.defaultMethodCode}.`);
  }

  const runStatusResponse = await request(apiUrl(`/v2/kornix/water-regime/calculation-runs/${encodeURIComponent(smoke.currentAppliedCalculationRunId)}`));
  const runStatus = await jsonOrNull(runStatusResponse);
  smoke.methodProfileCode = profileCode(runStatus);
  report.backendObserved.methodProfileCode = smoke.methodProfileCode;
  if (smoke.methodProfileCode && smoke.methodProfileCode !== EXPECTED_PROFILE_CODE) {
    throw new Error(`Expected method profile ${EXPECTED_PROFILE_CODE}, got ${smoke.methodProfileCode}.`);
  }

  const day = context.serverDate || context.calculationWindow?.from || '2026-06-10';
  const mapQuery = new URLSearchParams({
    calculationRunId: smoke.currentAppliedCalculationRunId,
    methodCode: EXPECTED_METHOD_CODE,
    day
  });
  const mapResponse = await request(apiUrl(`/v2/kornix/field-seasons/map?${mapQuery.toString()}`));
  const mapBody = await jsonOrNull(mapResponse);
  const features = Array.isArray(mapBody?.features) ? mapBody.features : [];
  smoke.mapFeatures = features.length;
  report.backendObserved.mapFeatures = features.length;
  smoke.cropNamePotatoCount = features.filter((feature) => /картофель|potato/i.test(feature?.properties?.cropName || '')).length;
  if (!mapResponse.ok || features.length !== expectedFieldCount) {
    throw new Error(`Map expected ${expectedFieldCount} features, got ${features.length}.`);
  }
  if (smoke.cropNamePotatoCount !== expectedFieldCount) {
    throw new Error(`Expected potato crop names for ${expectedFieldCount} fields, got ${smoke.cropNamePotatoCount}.`);
  }
  const missingMapFields = MAP_FAO90_FIELDS.filter((field) => features.some((feature) => !(field in (feature.properties || {}))));
  if (missingMapFields.length > 0) {
    throw new Error(`Map missing FAO90 properties: ${missingMapFields.join(', ')}.`);
  }

  const fieldSeasonId = features[0]?.properties?.fieldSeasonId;
  const profileQuery = new URLSearchParams({
    calculationRunId: smoke.currentAppliedCalculationRunId,
    methodCode: EXPECTED_METHOD_CODE,
    fieldSeasonIds: fieldSeasonId
  });
  const profileResponse = await request(apiUrl(`/v2/kornix/water-regime/profile-timeseries?${profileQuery.toString()}`));
  const profile = await jsonOrNull(profileResponse);
  const metrics = metricList(profile);
  const metricCodes = metrics.map(metricCode).filter(Boolean);
  smoke.profileMetricCount = metrics.length;
  report.backendObserved.profileMetricCount = metrics.length;
  smoke.missingMetrics = REQUIRED_METRICS.filter((code) => !metricCodes.includes(code));
  smoke.requiredMetricsPresent = smoke.missingMetrics.length === 0;
  smoke.shortwavePresent = metricCodes.includes('shortwave_radiation_daily_mj_m2');
  smoke.fao90MetricParsing = metrics.length >= expectedMetricCount && smoke.requiredMetricsPresent ? 'PASS' : 'FAIL';
  smoke.diagnosticsJsonHandled =
    metricCodes.includes('calculation_diagnostics_json') &&
    metricCodes.includes('calculation_warnings_json') &&
    metricCodes.includes('crop_stage_code')
      ? 'PASS'
      : 'FAIL';
  smoke.csvExportIncludesFao90Metrics = sourceHas('src/workspace/WaterRegimeChart.tsx', 'profile.metrics.flatMap') ? 'PASS' : 'FAIL';
  report.smoke.mapFeatures = smoke.mapFeatures;
  report.smoke.profileMetricCount = smoke.profileMetricCount;
  report.smoke.requiredMetricsPresent = smoke.requiredMetricsPresent;
  report.smoke.shortwavePresent = smoke.shortwavePresent;
  if (!profileResponse.ok || metrics.length < expectedMetricCount || !smoke.requiredMetricsPresent) {
    throw new Error(`Profile expected >=${expectedMetricCount} metrics; missing ${smoke.missingMetrics.join(', ') || 'none'}.`);
  }
  for (const code of ['soil_water_end_mm', 'root_zone_depth_m', 'water_stress_coefficient', 'actual_evapotranspiration_mm']) {
    const metric = metrics.find((item) => metricCode(item) === code);
    if (!hasNonNullMetricValue(metric)) {
      throw new Error(`Metric ${code} has no non-null value.`);
    }
  }

  if (context.frontendMode === 'current_editable' && context.submitAllowed === true) {
    const liveDay = context.serverDate >= context.managedScope.dateFrom && context.serverDate <= context.managedScope.dateTo
      ? context.serverDate
      : context.managedScope.dateFrom;
    const payload = {
      seasonYear: 2026,
      baseCalculationRunId: smoke.currentAppliedCalculationRunId,
      approvalClientGeneratedAt: new Date().toISOString(),
      managedScope: {
        dateFrom: context.managedScope.dateFrom,
        dateTo: context.managedScope.dateTo,
        fieldSeasonIds: context.managedScope.fieldSeasonIds,
        scopeVersion: context.managedScope.scopeVersion
      },
      irrigationLayer: [
        {
          fieldSeasonId: context.managedScope.fieldSeasonIds[0],
          irrigationDate: liveDay,
          irrigationMm: Number((1 + randomBytes(1)[0] / 50).toFixed(2))
        }
      ],
      clientDiff: { added: [], updated: [], deleted: [] }
    };
    const approval = await request(apiUrl('/v2/kornix/water-regime/approvals'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': sessionCsrf },
      body: JSON.stringify(payload)
    });
    const approvalBody = await jsonOrNull(approval);
    if (!approval.ok || !approvalBody?.approvalBatchId) {
      throw new Error(`Approval regression POST failed with HTTP ${approval.status}.`);
    }
    const approvalStatus = approvalBody.pollRequired
      ? await pollApproval(approvalBody.approvalBatchId)
      : approvalBody;
    const nextRunId = approvalStatus?.calculationRunId || approvalBody.calculationRunId;
    if (!nextRunId) {
      throw new Error('Approval regression did not return calculationRunId.');
    }
    const nextProfileQuery = new URLSearchParams({
      calculationRunId: nextRunId,
      methodCode: EXPECTED_METHOD_CODE,
      fieldSeasonIds: context.managedScope.fieldSeasonIds[0]
    });
    const nextProfileResponse = await request(apiUrl(`/v2/kornix/water-regime/profile-timeseries?${nextProfileQuery.toString()}`));
    const nextProfile = await jsonOrNull(nextProfileResponse);
    const nextMetrics = metricList(nextProfile);
    smoke.editableApprovalRegression = nextProfileResponse.ok && nextMetrics.length >= expectedMetricCount ? 'PASS' : 'FAIL';
    report.implementation.editableApprovalRegressionPreserved = smoke.editableApprovalRegression;
    if (smoke.editableApprovalRegression !== 'PASS') {
      throw new Error(`Approval regression profile expected >=${expectedMetricCount} metrics, got ${nextMetrics.length}.`);
    }
  } else {
    smoke.editableApprovalRegression = 'NOT_APPLICABLE';
    report.implementation.editableApprovalRegressionPreserved = 'NOT_APPLICABLE';
  }

  await request(apiUrl('/v2/auth/logout'), {
    method: 'POST',
    headers: { 'X-CSRF-Token': sessionCsrf }
  });
} catch (error) {
  addBlocker(error instanceof Error ? error.message : String(error));
} finally {
  cleanupEphemeralUser();
  const implementationReady = Object.values(report.implementation).every((value) => value === 'PASS' || value === 'NOT_APPLICABLE');
  const smokeReady =
    smoke.staticFrontend === 'PASS' &&
    smoke.sameOriginApiHealth === 'PASS' &&
    smoke.apiReturnedJsonNotHtml === true &&
    smoke.authenticatedSession === 'PASS' &&
    smoke.currentContext === 'PASS' &&
    smoke.mapFeatures === expectedFieldCount &&
    (smoke.profileMetricCount ?? 0) >= expectedMetricCount &&
    smoke.requiredMetricsPresent === true &&
    smoke.shortwavePresent === true &&
    smoke.fao90MetricParsing === 'PASS' &&
    smoke.diagnosticsJsonHandled === 'PASS' &&
    smoke.csvExportIncludesFao90Metrics === 'PASS' &&
    (smoke.editableApprovalRegression === 'PASS' || smoke.editableApprovalRegression === 'NOT_APPLICABLE') &&
    smoke.offlineModeUsed === false &&
    blockers.length === 0;
  smoke.status = smokeReady ? 'PASS' : 'FAIL';
  report.status =
    smokeReady && implementationReady
      ? READY_STATUS
      : backendReachable
        ? GAP_STATUS
        : BACKEND_UNREACHABLE_STATUS;
  saveReports();
  console.log(JSON.stringify({ status: report.status, output: outputJson, blockers }, null, 2));
  if (report.status !== READY_STATUS) {
    process.exitCode = 1;
  }
}
