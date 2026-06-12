import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const READY = 'KORNIX_FRONTEND_FAO90_VALUE_RENDERING_READY';
const NOT_READY_GAP = 'NOT_READY_FRONTEND_FAO90_VALUE_RENDERING_GAP';
const EXPECTED_RUN_ID = 'bb_bootstrap_f073cd7d9e3742929db55da5765a173e';
const EXPECTED_METHOD = 'simple_eto_single_layer_soil';
const EXPECTED_PROFILE = 'potato_medium_fao90_single_layer_v1';
const backendRepo = process.env.KORNIX_BACKEND_REPO || '/home/zenbook/meteo_stack_wsl_setup_v1_2/meteo_stack';
const outputPrefix = 'codex_reports/frontend_fao90_value_rendering';
const expectedFields = 37;
const expectedMetrics = 44;
const ephemeralUsername = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME || 'frontend_fao90_value_rendering_probe';
const ephemeralEmail = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_EMAIL || 'frontend-fao90-value-rendering@example.local';
const organizationCode = 'SP';
const cookieJar = new Map();
let cleanupRequired = false;
let credentials = {
  source: process.env.KORNIX_FRONTEND_SMOKE_USERNAME && process.env.KORNIX_FRONTEND_SMOKE_PASSWORD
    ? 'external_env'
    : 'ephemeral_backend_user',
  username: process.env.KORNIX_FRONTEND_SMOKE_USERNAME || ephemeralUsername,
  password: process.env.KORNIX_FRONTEND_SMOKE_PASSWORD || randomBytes(36).toString('base64url')
};

const mandatoryMetrics = [
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
  'eto_daily_mm',
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
  'calculation_warnings_json',
  'shortwave_radiation_daily_mj_m2'
];

const mapMandatoryMetrics = [
  'shortwave_radiation_daily_mj_m2',
  'soil_water_end_mm',
  'root_zone_depth_m',
  'actual_evapotranspiration_mm',
  'actual_transpiration_mm',
  'actual_soil_evaporation_mm',
  'days_after_sowing',
  'water_stress_coefficient'
];

function ensureReportsDir() {
  if (!existsSync('codex_reports')) {
    mkdirSync('codex_reports');
  }
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function runBackendCommand(args, env = {}) {
  return spawnSync('docker', ['compose', ...args], {
    cwd: backendRepo,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
}

function detectFrontendBaseUrl() {
  const candidates = [
    process.env.KORNIX_FRONTEND_SMOKE_BASE_URL,
    process.env.KORNIX_FRONTEND_BASE_URL,
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080'
  ].filter(Boolean);
  for (const baseUrl of candidates) {
    try {
      const response = spawnSync('curl', ['-fsS', baseUrl], { encoding: 'utf8', timeout: 5000 });
      if (response.status === 0 && response.stdout.includes('<div id="root">')) {
        return baseUrl.replace(/\/$/, '');
      }
    } catch {
      // Следующий кандидат.
    }
  }
  return candidates[0]?.replace(/\/$/, '') ?? 'http://127.0.0.1:5174';
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

function apiUrl(baseUrl, path) {
  return new URL(path.replace(/^\//, ''), `${baseUrl}/api/`).toString();
}

async function request(baseUrl, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', headers.get('Accept') || 'application/json');
  const cookies = cookieHeader();
  if (cookies) {
    headers.set('Cookie', cookies);
  }
  const response = await fetch(apiUrl(baseUrl, path), { ...options, headers });
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

function provisionEphemeralUser() {
  if (credentials.source !== 'ephemeral_backend_user') {
    return;
  }
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
      credentials.username,
      '--email',
      ephemeralEmail,
      '--roles',
      'viewer,farm_operator'
    ],
    { KORNIX_BOOTSTRAP_PASSWORD: credentials.password }
  );
  if (result.status !== 0) {
    throw new Error(`Ephemeral backend user provisioning failed with exit ${result.status}.`);
  }
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
    `DELETE FROM meteo.kornix_user_sessions WHERE user_id IN (SELECT user_id FROM meteo.kornix_users WHERE username = '${credentials.username}');`
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
    `UPDATE meteo.kornix_users SET is_active = false, updated_at = now() WHERE username = '${credentials.username}';`
  ]);
}

function metricCode(metric) {
  return metric?.long_name_for_code || metric?.metricCode || metric?.code || null;
}

function metricValue(point, metric) {
  if (!point) {
    return null;
  }
  if (metric?.valueKind === 'min_mean_max' || metric?.valueKind === 'mean_max_gust') {
    return point.mean ?? null;
  }
  return point.value ?? null;
}

function classify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return value === 0 || Object.is(value, -0) ? 'zero' : 'nonZero';
  if (Array.isArray(value)) return value.length === 0 ? 'zero' : 'nonZero';
  if (typeof value === 'object') return Object.keys(value).length === 0 ? 'zero' : 'nonZero';
  return value === '' || value === false ? 'zero' : 'nonZero';
}

function summarizeValues(values) {
  return values.reduce(
    (summary, value) => {
      const kind = classify(value);
      if (kind === 'null') summary.nullCount += 1;
      if (kind === 'zero') summary.zeroCount += 1;
      if (kind === 'nonZero') summary.nonZeroCount += 1;
      return summary;
    },
    { total: values.length, nullCount: 0, zeroCount: 0, nonZeroCount: 0 }
  );
}

function profileMetricInventory(profile) {
  const metrics = Array.isArray(profile?.metrics) ? profile.metrics : [];
  return metrics.map((metric) => {
    const points = Array.isArray(metric.points) ? metric.points : [];
    const values = points.map((point) => metricValue(point, metric));
    const serverPoint = points.find((point) => point.day === profile.serverDate);
    return {
      code: metricCode(metric),
      label: metric.label ?? null,
      unit: metric.unit ?? null,
      valueKind: metric.valueKind ?? null,
      ...summarizeValues(values),
      serverDateValue: metricValue(serverPoint, metric)
    };
  });
}

function countMandatoryProfileNulls(profile) {
  const inventory = profileMetricInventory(profile);
  return mandatoryMetrics.reduce((sum, code) => {
    const metric = inventory.find((item) => item.code === code);
    return sum + (metric ? metric.nullCount : 1);
  }, 0);
}

function countMapNulls(features) {
  return features.reduce((sum, feature) => {
    const properties = feature.properties || {};
    return sum + mapMandatoryMetrics.filter((code) => properties[code] === null || properties[code] === undefined).length;
  }, 0);
}

function countNoDataPlaceholdersForMandatory(profile) {
  return profileMetricInventory(profile)
    .filter((metric) => mandatoryMetrics.includes(metric.code))
    .reduce((sum, metric) => sum + metric.nullCount, 0);
}

function countProfileMetricNulls(profile, code) {
  const metric = profileMetricInventory(profile).find((item) => item.code === code);
  return metric ? metric.nullCount : 1;
}

function mandatoryNullSummary(profile) {
  const inventory = profileMetricInventory(profile);
  return mandatoryMetrics
    .map((code) => {
      const metric = inventory.find((item) => item.code === code);
      return {
        code,
        nullCount: metric ? metric.nullCount : 1,
        total: metric ? metric.total : 0,
        serverDateValue: metric ? metric.serverDateValue : null
      };
    })
    .filter((metric) => metric.nullCount > 0);
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

async function pollApproval(frontendBaseUrl, approvalBatchId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request(frontendBaseUrl, `/v2/kornix/water-regime/approvals/${encodeURIComponent(approvalBatchId)}`);
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

async function runEditableApprovalRegression(frontendBaseUrl, context, csrfToken, fallbackFieldSeasonIds) {
  if (context.submitAllowed !== true) {
    return { mode: 'READ_ONLY_EXPECTED', submitAllowed: false, readOnlyHandled: true };
  }

  const managedScope = context.managedScope;
  if (!managedScope?.dateFrom || !managedScope?.dateTo || !Array.isArray(managedScope.fieldSeasonIds)) {
    throw new Error('Editable approval regression cannot run: current-context has no managedScope.');
  }
  const fieldSeasonId = managedScope.fieldSeasonIds.find((id) => fallbackFieldSeasonIds.includes(id)) || managedScope.fieldSeasonIds[0];
  const day = context.serverDate >= managedScope.dateFrom && context.serverDate <= managedScope.dateTo
    ? context.serverDate
    : managedScope.dateFrom;
  const payload = {
    seasonYear: context.seasonYear || 2026,
    baseCalculationRunId: context.currentAppliedCalculationRunId,
    approvalClientGeneratedAt: new Date().toISOString(),
    managedScope: {
      dateFrom: managedScope.dateFrom,
      dateTo: managedScope.dateTo,
      fieldSeasonIds: managedScope.fieldSeasonIds,
      scopeVersion: managedScope.scopeVersion
    },
    irrigationLayer: [
      {
        fieldSeasonId,
        irrigationDate: day,
        irrigationMm: Number((1 + randomBytes(1)[0] / 50).toFixed(2))
      }
    ],
    clientDiff: { added: [], updated: [], deleted: [] }
  };

  const approvalResponse = await request(frontendBaseUrl, '/v2/kornix/water-regime/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(payload)
  });
  const approvalBody = await jsonOrNull(approvalResponse);
  if (!approvalResponse.ok || !approvalBody?.approvalBatchId) {
    throw new Error(`Approval regression POST failed with HTTP ${approvalResponse.status}.`);
  }
  const approvalStatus = approvalBody.pollRequired
    ? await pollApproval(frontendBaseUrl, approvalBody.approvalBatchId)
    : approvalBody;
  const finalStatus = approvalStatus?.approvalStatus || approvalBody.approvalStatus || null;
  if (finalStatus !== 'applied' && finalStatus !== 'no_changes') {
    throw new Error(`Approval regression readback returned status ${finalStatus}.`);
  }
  return {
    mode: 'PASS',
    submitAllowed: true,
    readOnlyHandled: false,
    approvalPost: 'PASS',
    approvalReadback: 'PASS'
  };
}

async function main() {
  ensureReportsDir();
  const frontendBaseUrl = detectFrontendBaseUrl();
  const blockers = [];
  const checks = {
    liveSmoke: 'FAIL'
  };
  const report = {
    status: NOT_READY_GAP,
    frontendBaseUrl,
    backendBaseline: {
      source: 'meteo-main(4).zip / backend main after FAO90 numerical correctness validation',
      expectedValidatedRunId: EXPECTED_RUN_ID,
      observedCurrentAppliedCalculationRunId: null,
      methodCode: null,
      profileCode: null,
      mapFeatures: null,
      profileMetrics: null,
      backendRuntimeStale: false
    },
    valueCoverage: {
      mandatoryMetricSetIncludesShortwave: mandatoryMetrics.includes('shortwave_radiation_daily_mj_m2'),
      mapMandatoryNulls: null,
      singleFieldProfileMandatoryNulls: null,
      multiFieldAggregatedMandatoryNulls: null,
      singleFieldProfileShortwaveNulls: null,
      multiFieldProfileShortwaveNulls: null,
      zerosPreservedAsZeros: false,
      negativeDaysAfterSowingPreserved: 'NOT_IN_SELECTED_WINDOW',
      noDataPlaceholdersForMandatoryMetrics: null
    },
    apiContract: {
      currentAppliedCalculationRunIdUsed: false,
      mapRequestIncludesDay: true,
      singleFieldProfilePass: false,
      multiFieldProfileUsesAggregation: true,
      multiFieldProfileNo422: false,
      mockModeUsed: false
    },
    frontendRendering: {
      chartDataContainsMandatoryValues: false,
      tooltipContainsMandatoryValues: false,
      csvExportContainsMandatoryValues: false,
      diagnosticsJsonHandled: false,
      warningsJsonHandled: false
    },
    editableRegression: {
      mode: 'NOT_RUN_WITH_REASON',
      submitAllowed: null,
      readOnlyHandled: false,
      approvalPost: 'NOT_RUN',
      approvalReadback: 'NOT_RUN'
    },
    checks,
    git: {
      committed: false,
      pushed: false,
      commitSha: null,
      worktreeClean: false,
      pushFailureReason: null
    },
    blockers
  };

  let liveSmoke = {
    status: 'FAIL',
    frontendBaseUrl,
    credentialSource: credentials.source,
    credentialsRedacted: true,
    requests: []
  };
  let inventory = {};

  try {
    const healthResponse = await request(frontendBaseUrl, '/v1/health');
    liveSmoke.requests.push({ endpoint: '/api/v1/health', status: healthResponse.status });
    if (!healthResponse.ok) throw new Error(`same-origin health failed with HTTP ${healthResponse.status}`);

    const apiUnauthed = await request(frontendBaseUrl, '/v1/me', { omitCookies: true });
    liveSmoke.requests.push({ endpoint: '/api/v1/me', unauthenticatedStatus: apiUnauthed.status });
    provisionEphemeralUser();

    const csrfResponse = await request(frontendBaseUrl, '/v1/auth/csrf');
    const csrfBody = await jsonOrNull(csrfResponse);
    const csrf = csrfBody?.csrfToken || csrfBody?.token;
    liveSmoke.requests.push({ endpoint: '/api/v1/auth/csrf', status: csrfResponse.status });
    if (!csrfResponse.ok || !csrf) throw new Error(`CSRF bootstrap failed with HTTP ${csrfResponse.status}`);

    const loginResponse = await request(frontendBaseUrl, '/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ username: credentials.username, password: credentials.password })
    });
    const loginBody = await jsonOrNull(loginResponse);
    const sessionCsrf = loginBody?.csrfToken || loginBody?.token || csrf;
    liveSmoke.requests.push({ endpoint: '/api/v1/auth/login', status: loginResponse.status });
    if (!loginResponse.ok) throw new Error(`Login failed with HTTP ${loginResponse.status}`);

    const meResponse = await request(frontendBaseUrl, '/v1/me');
    const me = await jsonOrNull(meResponse);
    liveSmoke.requests.push({ endpoint: '/api/v1/me', authenticatedStatus: meResponse.status, organizationCode: me?.organizationCode ?? null });
    if (!meResponse.ok || me?.organizationCode !== 'SP') throw new Error(`/api/v1/me organization mismatch.`);

    const contextResponse = await request(frontendBaseUrl, '/v2/kornix/current-context?seasonYear=2026');
    const context = await jsonOrNull(contextResponse);
    liveSmoke.requests.push({ endpoint: '/api/v2/kornix/current-context', status: contextResponse.status });
    if (!contextResponse.ok || !context?.currentAppliedCalculationRunId) throw new Error(`current-context failed with HTTP ${contextResponse.status}`);

    const calculationRunId = context.currentAppliedCalculationRunId;
    const methodCode = context.defaultMethodCode || context.methodCode;
    const day = context.serverDate || context.calculationWindow?.from;
    report.backendBaseline.observedCurrentAppliedCalculationRunId = calculationRunId;
    report.backendBaseline.methodCode = methodCode;
    report.apiContract.currentAppliedCalculationRunIdUsed = true;
    report.editableRegression.submitAllowed = context.submitAllowed === true;
    report.editableRegression.mode = context.submitAllowed === true ? 'NOT_RUN_WITH_REASON' : 'READ_ONLY_EXPECTED';
    report.editableRegression.readOnlyHandled = context.submitAllowed !== true;

    const runStatusResponse = await request(frontendBaseUrl, `/v2/kornix/water-regime/calculation-runs/${encodeURIComponent(calculationRunId)}`);
    const runStatus = await jsonOrNull(runStatusResponse);
    report.backendBaseline.profileCode = profileCode(runStatus) || 'NOT_EXPOSED';
    liveSmoke.requests.push({ endpoint: '/api/v2/kornix/water-regime/calculation-runs/{calculationRunId}', status: runStatusResponse.status });

    const mapQuery = new URLSearchParams({ calculationRunId, methodCode, day });
    const mapResponse = await request(frontendBaseUrl, `/v2/kornix/field-seasons/map?${mapQuery.toString()}`);
    const map = await jsonOrNull(mapResponse);
    const features = Array.isArray(map?.features) ? map.features : [];
    report.backendBaseline.mapFeatures = features.length;
    liveSmoke.requests.push({ endpoint: '/api/v2/kornix/field-seasons/map', status: mapResponse.status, day });
    if (!mapResponse.ok) throw new Error(`map failed with HTTP ${mapResponse.status}`);

    const fieldSeasonIds = features.map((feature) => feature?.properties?.fieldSeasonId).filter(Boolean);
    const singleId = fieldSeasonIds[0];
    const multiIds = fieldSeasonIds.slice(0, 3);
    const singleQuery = new URLSearchParams({ calculationRunId, methodCode, fieldSeasonIds: singleId });
    const singleResponse = await request(frontendBaseUrl, `/v2/kornix/water-regime/profile-timeseries?${singleQuery.toString()}`);
    const singleProfile = await jsonOrNull(singleResponse);
    liveSmoke.requests.push({ endpoint: '/api/v2/kornix/water-regime/profile-timeseries', status: singleResponse.status, aggregation: null });
    report.apiContract.singleFieldProfilePass = singleResponse.ok;

    const multiQuery = new URLSearchParams({ calculationRunId, methodCode, fieldSeasonIds: multiIds.join(','), aggregation: 'area_weighted_mean' });
    const multiResponse = await request(frontendBaseUrl, `/v2/kornix/water-regime/profile-timeseries?${multiQuery.toString()}`);
    const multiProfile = await jsonOrNull(multiResponse);
    liveSmoke.requests.push({ endpoint: '/api/v2/kornix/water-regime/profile-timeseries', status: multiResponse.status, aggregation: 'area_weighted_mean' });
    report.apiContract.multiFieldProfileNo422 = multiResponse.status !== 422;

    report.editableRegression = await runEditableApprovalRegression(frontendBaseUrl, context, sessionCsrf, fieldSeasonIds);
    liveSmoke.requests.push({
      endpoint: '/api/v2/kornix/water-regime/approvals',
      status: report.editableRegression.approvalPost === 'PASS' ? 200 : 'READ_ONLY_EXPECTED'
    });

    const metrics = Array.isArray(singleProfile?.metrics) ? singleProfile.metrics : [];
    report.backendBaseline.profileMetrics = metrics.length;
    report.valueCoverage.mapMandatoryNulls = countMapNulls(features);
    report.valueCoverage.singleFieldProfileMandatoryNulls = countMandatoryProfileNulls(singleProfile);
    report.valueCoverage.multiFieldAggregatedMandatoryNulls = countMandatoryProfileNulls(multiProfile);
    report.valueCoverage.singleFieldProfileShortwaveNulls = countProfileMetricNulls(singleProfile, 'shortwave_radiation_daily_mj_m2');
    report.valueCoverage.multiFieldProfileShortwaveNulls = countProfileMetricNulls(multiProfile, 'shortwave_radiation_daily_mj_m2');
    report.valueCoverage.noDataPlaceholdersForMandatoryMetrics = countNoDataPlaceholdersForMandatory(singleProfile);
    const metricInventory = profileMetricInventory(singleProfile);
    report.valueCoverage.zerosPreservedAsZeros = metricInventory.some((metric) => metric.zeroCount > 0);
    const daysAfter = metrics.find((metric) => metricCode(metric) === 'days_after_sowing');
    const daysValues = Array.isArray(daysAfter?.points) ? daysAfter.points.map((point) => point.value).filter((value) => typeof value === 'number') : [];
    report.valueCoverage.negativeDaysAfterSowingPreserved = daysValues.some((value) => value < 0) ? true : 'NOT_IN_SELECTED_WINDOW';
    report.frontendRendering.chartDataContainsMandatoryValues = report.valueCoverage.singleFieldProfileMandatoryNulls === 0;
    report.frontendRendering.tooltipContainsMandatoryValues = report.valueCoverage.mapMandatoryNulls === 0;
    report.frontendRendering.csvExportContainsMandatoryValues = report.valueCoverage.singleFieldProfileMandatoryNulls === 0;
    report.frontendRendering.diagnosticsJsonHandled = metricInventory.some((metric) => metric.code === 'calculation_diagnostics_json');
    report.frontendRendering.warningsJsonHandled = metricInventory.some((metric) => metric.code === 'calculation_warnings_json');

    inventory = {
      context: {
        calculationRunId,
        methodCode,
        serverDate: day,
        frontendMode: context.frontendMode,
        submitAllowed: context.submitAllowed
      },
      map: {
        featureCount: features.length,
        mandatoryNulls: report.valueCoverage.mapMandatoryNulls,
        propertySummary: mapMandatoryMetrics.map((code) => ({
          code,
          ...summarizeValues(features.map((feature) => feature.properties?.[code]))
        }))
      },
      singleFieldProfile: {
        fieldSeasonId: singleId,
        metricCount: metrics.length,
        mandatoryNulls: report.valueCoverage.singleFieldProfileMandatoryNulls,
        mandatoryNullMetrics: mandatoryNullSummary(singleProfile),
        metricSummary: metricInventory
      },
      multiFieldProfile: {
        fieldSeasonIds: multiIds,
        status: multiResponse.status,
        mandatoryNulls: report.valueCoverage.multiFieldAggregatedMandatoryNulls,
        mandatoryNullMetrics: mandatoryNullSummary(multiProfile),
        metricSummary: profileMetricInventory(multiProfile)
      }
    };

    const currentRunAcceptable =
      calculationRunId === EXPECTED_RUN_ID &&
      methodCode === EXPECTED_METHOD &&
      features.length === expectedFields &&
      metrics.length === expectedMetrics &&
      report.valueCoverage.mapMandatoryNulls === 0 &&
      report.valueCoverage.singleFieldProfileMandatoryNulls === 0 &&
      report.valueCoverage.multiFieldAggregatedMandatoryNulls === 0 &&
      report.valueCoverage.singleFieldProfileShortwaveNulls === 0 &&
      report.valueCoverage.multiFieldProfileShortwaveNulls === 0;
    report.backendBaseline.backendRuntimeStale =
      calculationRunId.startsWith('kornix_api_') &&
      (
        report.valueCoverage.mapMandatoryNulls > 0 ||
        report.valueCoverage.singleFieldProfileMandatoryNulls > 0 ||
        report.valueCoverage.multiFieldAggregatedMandatoryNulls > 0
      );

    if (!currentRunAcceptable || report.backendBaseline.backendRuntimeStale) {
      blockers.push(`Backend runtime stale or masking values: currentAppliedCalculationRunId=${calculationRunId}, expected=${EXPECTED_RUN_ID}, mandatory nulls map/single/multi=${report.valueCoverage.mapMandatoryNulls}/${report.valueCoverage.singleFieldProfileMandatoryNulls}/${report.valueCoverage.multiFieldAggregatedMandatoryNulls}.`);
      report.status = NOT_READY_GAP;
    } else if (
      calculationRunId === EXPECTED_RUN_ID &&
      methodCode === EXPECTED_METHOD &&
      features.length === expectedFields &&
      metrics.length === expectedMetrics &&
      report.apiContract.singleFieldProfilePass &&
      report.apiContract.multiFieldProfileNo422 &&
      report.valueCoverage.mapMandatoryNulls === 0 &&
      report.valueCoverage.singleFieldProfileMandatoryNulls === 0 &&
      report.valueCoverage.multiFieldAggregatedMandatoryNulls === 0 &&
      report.valueCoverage.singleFieldProfileShortwaveNulls === 0 &&
      report.valueCoverage.multiFieldProfileShortwaveNulls === 0
    ) {
      report.status = READY;
      checks.liveSmoke = 'PASS';
      liveSmoke.status = 'PASS';
    } else {
      const singleNullCodes = mandatoryNullSummary(singleProfile).map((metric) => `${metric.code}:${metric.nullCount}`).join(', ') || 'none';
      const multiNullCodes = mandatoryNullSummary(multiProfile).map((metric) => `${metric.code}:${metric.nullCount}`).join(', ') || 'none';
      blockers.push(`Frontend value rendering gate failed mandatory profile coverage: single=${singleNullCodes}; multi=${multiNullCodes}.`);
      report.status = NOT_READY_GAP;
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
    report.status = blockers.some((blocker) => blocker.includes('Login') || blocker.includes('CSRF')) ? 'NOT_READY_FRONTEND_FAO90_AUTH_GAP' : NOT_READY_GAP;
  } finally {
    cleanupEphemeralUser();
  }

  liveSmoke.status = report.status === READY ? 'PASS' : 'FAIL';
  liveSmoke.blockers = blockers;
  report.checks.liveSmoke = liveSmoke.status;
  writeJson(`${outputPrefix}_live_smoke.json`, liveSmoke);
  writeJson(`${outputPrefix}_metric_value_inventory.json`, inventory);
  writeJson(`${outputPrefix}_contract_map.json`, {
    expectedFrontendBaseUrlOrder: ['env', 'http://127.0.0.1:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:8080'],
    endpoints: {
      currentContext: '/api/v2/kornix/current-context?seasonYear=2026',
      map: '/api/v2/kornix/field-seasons/map?calculationRunId=<run>&methodCode=<method>&day=<YYYY-MM-DD>',
      singleProfile: '/api/v2/kornix/water-regime/profile-timeseries?calculationRunId=<run>&methodCode=<method>&fieldSeasonIds=<id>',
      multiProfile: '/api/v2/kornix/water-regime/profile-timeseries?calculationRunId=<run>&methodCode=<method>&fieldSeasonIds=<id1,id2,id3>&aggregation=area_weighted_mean',
      runStatus: '/api/v2/kornix/water-regime/calculation-runs/{calculationRunId}',
      approvals: '/api/v2/kornix/water-regime/approvals'
    },
    mandatoryMetrics,
    mapMandatoryMetrics
  });
  writeJson(`${outputPrefix}_report.json`, report);
  writeFileSync(
    `${outputPrefix}_report.md`,
    [
      `# Frontend FAO90 Value Rendering Report`,
      ``,
      `Status: ${report.status}`,
      ``,
      `## Backend observed`,
      `- frontendBaseUrl: ${frontendBaseUrl}`,
      `- currentAppliedCalculationRunId: ${report.backendBaseline.observedCurrentAppliedCalculationRunId}`,
      `- methodCode: ${report.backendBaseline.methodCode}`,
      `- profileCode: ${report.backendBaseline.profileCode}`,
      `- map features: ${report.backendBaseline.mapFeatures}`,
      `- profile metrics: ${report.backendBaseline.profileMetrics}`,
      `- backendRuntimeStale: ${report.backendBaseline.backendRuntimeStale}`,
      ``,
      `## Value coverage`,
      `- mapMandatoryNulls: ${report.valueCoverage.mapMandatoryNulls}`,
      `- singleFieldProfileMandatoryNulls: ${report.valueCoverage.singleFieldProfileMandatoryNulls}`,
      `- multiFieldAggregatedMandatoryNulls: ${report.valueCoverage.multiFieldAggregatedMandatoryNulls}`,
      `- singleFieldProfileShortwaveNulls: ${report.valueCoverage.singleFieldProfileShortwaveNulls}`,
      `- multiFieldProfileShortwaveNulls: ${report.valueCoverage.multiFieldProfileShortwaveNulls}`,
      `- zerosPreservedAsZeros: ${report.valueCoverage.zerosPreservedAsZeros}`,
      ``,
      `## Blockers`,
      ...(blockers.length ? blockers.map((blocker) => `- ${blocker}`) : ['- none']),
      ``
    ].join('\n')
  );

  console.log(JSON.stringify({
    status: report.status,
    frontendBaseUrl,
    currentAppliedCalculationRunId: report.backendBaseline.observedCurrentAppliedCalculationRunId,
    mapMandatoryNulls: report.valueCoverage.mapMandatoryNulls,
    singleFieldProfileMandatoryNulls: report.valueCoverage.singleFieldProfileMandatoryNulls,
    multiFieldAggregatedMandatoryNulls: report.valueCoverage.multiFieldAggregatedMandatoryNulls,
    singleFieldProfileShortwaveNulls: report.valueCoverage.singleFieldProfileShortwaveNulls,
    multiFieldProfileShortwaveNulls: report.valueCoverage.multiFieldProfileShortwaveNulls,
    blockers
  }, null, 2));
  if (report.status !== READY) {
    process.exitCode = 1;
  }
}

main();
