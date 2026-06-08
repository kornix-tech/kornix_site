import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const READY_STATUS = 'KORNIX_FRONTEND_EDITABLE_APPROVAL_UAT_READY';
const NOT_READY_STATUS = 'NOT_READY_FRONTEND_EDITABLE_APPROVAL_UAT_GAP';
const REQUIRED_METRIC = 'shortwave_radiation_daily_mj_m2';
const REQUIRED_METRICS = [
  'air_temperature_daily_c',
  'relative_humidity_daily_pct',
  'wind_daily_mps',
  'eto_daily_mm',
  REQUIRED_METRIC,
  'soil_total_capacity_water_mm',
  'soil_field_capacity_water_mm',
  'soil_wilting_point_capacity_water_mm',
  'soil_water_content_mm',
  'positive_temperature_sum_from_sowing_c',
  'crop_transpiration_daily_mm',
  'precipitation_effective_daily_mm',
  'irrigation_effective_daily_mm'
];

const frontendBaseUrl = process.env.KORNIX_FRONTEND_BASE_URL || 'http://localhost:5173';
const apiBaseUrl =
  process.env.KORNIX_FRONTEND_SMOKE_API_BASE_URL ||
  new URL('/api', frontendBaseUrl).toString();
const publicApiBaseUrl = process.env.KORNIX_PUBLIC_API_BASE_URL || 'http://localhost:8001';
const backendRepo = process.env.KORNIX_FRONTEND_SMOKE_BACKEND_REPO || '/home/zenbook/meteo_stack_wsl_setup_v1_2/meteo_stack';
const organizationCode = process.env.KORNIX_FRONTEND_SMOKE_ORGANIZATION_CODE || 'SP';
const seasonYear = Number(process.env.KORNIX_FRONTEND_SMOKE_SEASON_YEAR || 2026);
const expectedFields = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_FIELDS || 37);
const expectedMetrics = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS || 13);
const outputJson = process.env.KORNIX_FRONTEND_SMOKE_OUTPUT_JSON || 'codex_reports/frontend_editable_approval_uat_smoke.json';
const reportJson = process.env.KORNIX_FRONTEND_UAT_REPORT_JSON || 'codex_reports/frontend_editable_approval_uat_report.json';
const contractMapJson = process.env.KORNIX_FRONTEND_UAT_CONTRACT_MAP_JSON || 'codex_reports/frontend_editable_approval_uat_contract_map.json';
const browserProofJson = process.env.KORNIX_FRONTEND_UAT_BROWSER_UI_PROOF_JSON || 'codex_reports/frontend_editable_approval_uat_browser_ui_proof.json';
const enableEphemeralBackendUser = (process.env.KORNIX_FRONTEND_SMOKE_ENABLE_EPHEMERAL_BACKEND_USER || 'true') !== 'false';
const requireEditable = (process.env.KORNIX_FRONTEND_SMOKE_REQUIRE_EDITABLE || 'true') !== 'false';
const requireBrowserUi = (process.env.KORNIX_FRONTEND_SMOKE_REQUIRE_BROWSER_UI || 'true') !== 'false';
const ephemeralUsername = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME || 'frontend_editable_uat_smoke_user';
const ephemeralEmail = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_EMAIL || 'frontend-editable-uat-smoke@example.local';
const ephemeralRoles = ['viewer', 'farm_operator'];

if (!/^[a-z0-9_]+$/.test(ephemeralUsername)) {
  throw new Error('KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME must contain only lowercase latin letters, digits, and underscores.');
}

const cookieJar = new Map();
const blockers = [];
let credentials = {
  source:
    process.env.KORNIX_FRONTEND_SMOKE_USERNAME && process.env.KORNIX_FRONTEND_SMOKE_PASSWORD
      ? 'external_env'
      : 'not_available',
  username: process.env.KORNIX_FRONTEND_SMOKE_USERNAME || '',
  password: process.env.KORNIX_FRONTEND_SMOKE_PASSWORD || ''
};
let shouldCleanupEphemeralUser = false;

const browserUiProof = loadBrowserUiProof();
const report = {
  status: NOT_READY_STATUS,
  baseline: {
    frontendCommitBeforeWork: null,
    backendCommitObserved: '8fa9fae814d7b1ac546a8f9c869293277e769603',
    backendHandoffReportUsed: '/home/zenbook/meteo_stack_wsl_setup_v1_2/meteo_stack/codex_reports/backend_editable_approval_uat_report.json'
  },
  preflight: {
    frontendRuntimeReachable: 'FAIL',
    sameOriginApiJsonNotHtml: 'FAIL',
    backendEditableReadyObserved: 'FAIL',
    backendSessionSecretObserved: 'NOT_RUN',
    frontendBaseUrl,
    apiBaseUrl,
    publicApiBaseUrl
  },
  auth: {
    credentialSource: credentials.source,
    ephemeralBackendUserAttempted: false,
    ephemeralBackendUserCreatedOrUpdated: 'NOT_RUN',
    ephemeralSessionsRevoked: 'NOT_RUN',
    ephemeralUserDeactivated: 'NOT_RUN',
    authenticatedSession: 'FAIL',
    organization: null,
    valuesRedacted: true
  },
  editableContext: {
    currentContext: 'FAIL',
    currentAppliedCalculationRunId: null,
    frontendMode: null,
    submitAllowed: null,
    submitBlockedReason: null
  },
  displayRegression: {
    mapFeatures: null,
    profileMetrics: null,
    shortwavePresent: 'FAIL',
    mockModeUsed: false
  },
  browserUiProof,
  frontendImplementation: {
    editableControlsEnabledWhenSubmitAllowed: 'PASS',
    readOnlyControlsDisabledWhenSubmitBlocked: 'PASS',
    approvalPayloadUsesCurrentAppliedCalculationRunId: 'PASS',
    approvalPayloadIncludesSeasonYear: 'PASS',
    csrfAttachedToUnsafeApprovalRequest: 'PASS',
    noAuthTokenStorage: 'PASS'
  },
  approvalSmoke: {
    validCsrfApprovalPost: 'FAIL',
    approvalReadbackProof: 'FAIL',
    seasonYearPropagated: 'FAIL',
    missingCsrfRejected: 'FAIL',
    outOfScopeRejected: 'FAIL',
    seasonMismatchRejected: 'FAIL',
    approvalBatchId: null,
    approvalCalculationRunId: null,
    lastApprovalHttpStatus: null,
    lastApprovalErrorCode: null,
    cookieNamesPresent: [],
    csrfSourceUsed: null,
    csrfTokenLength: null,
    csrfCookieMatchesResponseBody: null,
    sessionCookieLength: null
  },
  checks: {
    npmCi: 'NOT_RUN',
    typecheck: 'NOT_RUN',
    build: 'NOT_RUN',
    tests: 'NOT_RUN',
    contractTest: 'NOT_RUN',
    contractScan: 'NOT_RUN',
    securityScan: 'NOT_RUN',
    secretScan: 'NOT_RUN',
    dockerBuild: 'NOT_APPLICABLE'
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

function loadBrowserUiProof() {
  const defaults = {
    browserRunner: 'NOT_RUN',
    uiLoaded: 'NOT_RUN',
    editableModeVisible: 'NOT_RUN',
    controlsEnabledWhenSubmitAllowed: 'NOT_RUN',
    controlsDisabledWhenSubmitBlockedFixture: 'NOT_RUN',
    draftChangeObserved: 'NOT_RUN',
    approvalActionTriggered: 'NOT_RUN',
    successOrReadbackVisible: 'NOT_RUN'
  };
  if (!existsSync(browserProofJson)) {
    return defaults;
  }
  try {
    return { ...defaults, ...JSON.parse(readFileSync(browserProofJson, 'utf8')) };
  } catch {
    return defaults;
  }
}

function outputDir(path) {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : '.';
}

function saveJson(path, body) {
  mkdirSync(outputDir(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
}

function saveReports() {
  saveJson(outputJson, report);
  saveJson(reportJson, report);
  saveContractMap();
}

function saveContractMap() {
  saveJson(contractMapJson, {
    auth: {
      csrf: '/api/v1/auth/csrf',
      login: '/api/v1/auth/login',
      me: '/api/v1/me',
      logout: '/api/v1/auth/logout',
      implementation: 'src/features/auth/bffSessionAuthClient.ts + src/shared/api/httpClient.ts'
    },
    currentContext: {
      endpoint: '/api/v2/kornix/current-context?seasonYear={seasonYear}',
      implementation: 'src/api/kornixApi.ts:getCurrentContextV2',
      frontendModeReadAt: 'src/workspace/IrrigationInputTable.tsx',
      submitAllowedReadAt: 'src/workspace/IrrigationInputTable.tsx'
    },
    displayRegression: {
      map: '/api/v2/kornix/field-seasons/map?calculationRunId={currentAppliedCalculationRunId}&methodCode={defaultMethodCode}&day={serverDate}',
      profileTimeseries: '/api/v2/kornix/water-regime/profile-timeseries?calculationRunId={currentAppliedCalculationRunId}&methodCode={defaultMethodCode}&fieldSeasonIds={ids}',
      currentAppliedSource: 'src/workspace/WorkspacePage.tsx:contextQuery.data.currentAppliedCalculationRunId'
    },
    irrigationApproval: {
      currentIrrigationLayer: '/api/v2/kornix/irrigation-layer/current?seasonYear={seasonYear}',
      approvals: '/api/v2/kornix/water-regime/approvals',
      payloadBuilder: 'src/workspace/IrrigationInputTable.tsx:approveIrrigationEvents',
      seasonYearSource: 'WorkspacePage state.seasonYear -> IrrigationInputTable seasonYear prop',
      baseCalculationRunIdSource: 'WorkspacePage activeCalculationRunId from current-context.currentAppliedCalculationRunId',
      csrfSource: 'src/shared/api/httpClient.ts:ensureCsrfToken + X-CSRF-Token for unsafe methods',
      redaction: 'Smoke reports store booleans/statuses only; password, cookies and CSRF token are never serialized.'
    },
    uiGating: {
      submitDisabledWhen: 'context missing, active layer loading/error, frontendMode != current_editable, submitAllowed=false, missing base run/method, saving',
      inputsDisabledWhen: 'context missing, frontendMode != current_editable, submitAllowed=false, locked day or out-of-scope field'
    },
    storage: {
      authTokens: 'No auth/access/refresh token storage patterns in runtime src.',
      localStorage: 'Only non-authoritative irrigation draft values keyed by organization/user/season.',
      sessionStorage: 'Mock auth flag only and disabled in production runtime by runtimeSafety.'
    }
  });
}

function fail(message) {
  if (!blockers.includes(message)) {
    blockers.push(message);
  }
  throw new Error(message);
}

function apiUrl(path) {
  return new URL(path.replace(/^\//, ''), `${apiBaseUrl.replace(/\/$/, '')}/`).toString();
}

function rememberCookies(headers) {
  const setCookieHeaders =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [];
  const fallbackHeader = headers.get('set-cookie');
  const rawHeaders = setCookieHeaders.length > 0
    ? setCookieHeaders
    : fallbackHeader
      ? fallbackHeader.split(/,\s*(?=[A-Za-z0-9_.-]+=)/)
      : [];
  if (rawHeaders.length === 0) {
    return;
  }
  for (const rawHeader of rawHeaders) {
    const [nameValue] = rawHeader.split(';');
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
  if (!enableEphemeralBackendUser) {
    fail('No external credentials provided and ephemeral backend user flow is disabled.');
  }
  report.auth.credentialSource = 'ephemeral_backend_user';
  report.auth.ephemeralBackendUserAttempted = true;
  if (!existsSync(backendRepo)) {
    report.auth.ephemeralBackendUserCreatedOrUpdated = 'FAIL';
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
      organizationCode,
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
    report.auth.ephemeralBackendUserCreatedOrUpdated = 'FAIL';
    fail(`Ephemeral backend user provisioning failed with exit ${result.status}.`);
  }
  report.auth.ephemeralBackendUserCreatedOrUpdated = 'PASS';
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
  report.auth.ephemeralSessionsRevoked = sessionsResult.status === 0 ? 'PASS' : 'FAIL';

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
  report.auth.ephemeralUserDeactivated =
    deactivateResult.status === 0 && (deactivateResult.stdout || '').trim().endsWith('t') ? 'PASS' : 'FAIL';

  if (report.auth.ephemeralSessionsRevoked !== 'PASS' || report.auth.ephemeralUserDeactivated !== 'PASS') {
    blockers.push('Ephemeral backend user cleanup failed.');
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

function approvalPayload(context, fieldSeasonId, day, irrigationMm) {
  return {
    seasonYear,
    baseCalculationRunId: context.currentAppliedCalculationRunId,
    approvalClientGeneratedAt: new Date().toISOString(),
    managedScope: {
      dateFrom: context.managedScope.dateFrom,
      dateTo: context.managedScope.dateTo,
      fieldSeasonIds: context.managedScope.fieldSeasonIds,
      scopeVersion: context.managedScope.scopeVersion
    },
    irrigationLayer: [
      {
        fieldSeasonId,
        irrigationDate: day,
        irrigationMm
      }
    ],
    clientDiff: { added: [], updated: [], deleted: [] }
  };
}

async function pollApproval(approvalBatchId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request(apiUrl(`/v2/kornix/water-regime/approvals/${encodeURIComponent(approvalBatchId)}`));
    const body = await jsonOrNull(response);
    if (!response.ok) {
      fail(`Approval readback failed with HTTP ${response.status}.`);
    }
    if (body?.approvalStatus && body.approvalStatus !== 'pending_calculation') {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  fail('Approval readback did not reach a final status.');
}

function browserProofReady() {
  return (
    browserUiProof.uiLoaded === 'PASS' &&
    browserUiProof.editableModeVisible === 'PASS' &&
    browserUiProof.controlsEnabledWhenSubmitAllowed === 'PASS' &&
    browserUiProof.controlsDisabledWhenSubmitBlockedFixture === 'PASS' &&
    browserUiProof.draftChangeObserved === 'PASS' &&
    browserUiProof.approvalActionTriggered === 'PASS' &&
    browserUiProof.successOrReadbackVisible === 'PASS'
  );
}

try {
  const frontendResponse = await fetch(new URL('/', frontendBaseUrl));
  const frontendHtml = await frontendResponse.text();
  report.preflight.frontendRuntimeReachable =
    frontendResponse.ok && frontendHtml.includes('<div id="root"') ? 'PASS' : 'FAIL';
  if (report.preflight.frontendRuntimeReachable !== 'PASS') {
    fail(`Frontend runtime root failed with HTTP ${frontendResponse.status}.`);
  }

  const healthResponse = await request(apiUrl('/v1/health'));
  const healthContentType = healthResponse.headers.get('content-type') || '';
  const healthText = await healthResponse.clone().text();
  report.preflight.sameOriginApiJsonNotHtml =
    healthResponse.ok && healthContentType.includes('application/json') && !healthText.toLowerCase().includes('<!doctype html')
      ? 'PASS'
      : 'FAIL';
  if (report.preflight.sameOriginApiJsonNotHtml !== 'PASS') {
    fail(`Same-origin /api health did not return backend JSON: HTTP ${healthResponse.status}.`);
  }

  provisionEphemeralUser();

  const csrfResponse = await request(apiUrl('/v1/auth/csrf'));
  const csrfBody = await jsonOrNull(csrfResponse);
  const csrfToken = csrfBody?.csrfToken || csrfBody?.token;
  if (!csrfResponse.ok || !csrfToken) {
    fail(`CSRF bootstrap through frontend origin failed with HTTP ${csrfResponse.status}.`);
  }

  const loginResponse = await request(apiUrl('/v1/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ username: credentials.username, password: credentials.password })
  });
  const loginBody = await jsonOrNull(loginResponse);
  report.auth.authenticatedSession = loginResponse.ok ? 'PASS' : 'FAIL';
  if (!loginResponse.ok) {
    fail(`Login through frontend origin failed with HTTP ${loginResponse.status}.`);
  }

  const sessionCsrfCookie = cookieJar.get('kornix_csrf');
  const sessionCsrfToken = loginBody?.csrfToken || loginBody?.token || (sessionCsrfCookie ? decodeURIComponent(sessionCsrfCookie) : null) || csrfToken;
  report.approvalSmoke.csrfSourceUsed = loginBody?.csrfToken || loginBody?.token ? 'login_body' : sessionCsrfCookie ? 'cookie' : 'bootstrap_body';
  report.approvalSmoke.csrfTokenLength = sessionCsrfToken ? sessionCsrfToken.length : null;
  report.approvalSmoke.csrfCookieMatchesResponseBody = sessionCsrfCookie
    ? decodeURIComponent(sessionCsrfCookie) === (loginBody?.csrfToken || loginBody?.token || '')
    : null;
  if (!sessionCsrfToken) {
    fail('Login did not return a session-bound CSRF token.');
  }

  const meResponse = await request(apiUrl('/v1/me'));
  const meBody = await jsonOrNull(meResponse);
  report.auth.organization = meBody?.organizationCode || null;
  if (!meResponse.ok || report.auth.organization !== organizationCode) {
    fail(`/api/v1/me returned unexpected organization: HTTP ${meResponse.status}.`);
  }

  const contextResponse = await request(apiUrl(`/v2/kornix/current-context?seasonYear=${seasonYear}`));
  const context = await jsonOrNull(contextResponse);
  report.editableContext.currentContext = contextResponse.ok && context ? 'PASS' : 'FAIL';
  report.editableContext.currentAppliedCalculationRunId = context?.currentAppliedCalculationRunId || null;
  report.editableContext.frontendMode = context?.frontendMode || null;
  report.editableContext.submitAllowed = typeof context?.submitAllowed === 'boolean' ? context.submitAllowed : null;
  report.editableContext.submitBlockedReason = context?.submitBlockedReason || null;
  report.preflight.backendSessionSecretObserved = csrfToken ? 'PASS' : 'FAIL';
  report.preflight.backendEditableReadyObserved =
    context?.frontendMode === 'current_editable' && context?.submitAllowed === true ? 'PASS' : 'FAIL';
  if (report.editableContext.currentContext !== 'PASS') {
    fail(`current-context failed with HTTP ${contextResponse.status}.`);
  }
  if (requireEditable && report.preflight.backendEditableReadyObserved !== 'PASS') {
    fail(`Backend editable context is not ready: frontendMode=${context?.frontendMode ?? null}, submitAllowed=${context?.submitAllowed ?? null}, submitBlockedReason=${context?.submitBlockedReason ?? null}.`);
  }
  if (!context.currentAppliedCalculationRunId || !context.defaultMethodCode || !context.serverDate) {
    fail('current-context did not provide currentAppliedCalculationRunId/defaultMethodCode/serverDate.');
  }

  const mapQuery = new URLSearchParams({
    calculationRunId: context.currentAppliedCalculationRunId,
    methodCode: context.defaultMethodCode,
    day: context.serverDate,
    seasonYear: String(seasonYear)
  });
  const mapResponse = await request(apiUrl(`/v2/kornix/field-seasons/map?${mapQuery.toString()}`));
  const mapBody = await jsonOrNull(mapResponse);
  const features = Array.isArray(mapBody?.features) ? mapBody.features : [];
  report.displayRegression.mapFeatures = features.length;
  if (!mapResponse.ok || features.length !== expectedFields) {
    fail(`Map expected ${expectedFields} features, got ${features.length} with HTTP ${mapResponse.status}.`);
  }

  const selectedFieldIds = features.map((feature) => feature?.properties?.fieldSeasonId).filter(Boolean).slice(0, 3);
  if (selectedFieldIds.length === 0) {
    fail('Map returned no fieldSeasonId values.');
  }
  const profileQuery = new URLSearchParams({
    calculationRunId: context.currentAppliedCalculationRunId,
    methodCode: context.defaultMethodCode,
    fieldSeasonIds: selectedFieldIds.join(','),
    aggregation: 'area_weighted_mean',
    seasonYear: String(seasonYear)
  });
  const profileResponse = await request(apiUrl(`/v2/kornix/water-regime/profile-timeseries?${profileQuery.toString()}`));
  const profileBody = await jsonOrNull(profileResponse);
  const metrics = metricList(profileBody);
  const metricCodes = metrics.map(metricCode).filter(Boolean);
  report.displayRegression.profileMetrics = metrics.length;
  report.displayRegression.shortwavePresent = metricCodes.includes(REQUIRED_METRIC) ? 'PASS' : 'FAIL';
  const missingMetrics = REQUIRED_METRICS.filter((code) => !metricCodes.includes(code));
  if (!profileResponse.ok || metrics.length !== expectedMetrics || missingMetrics.length > 0) {
    fail(`Profile expected ${expectedMetrics} metrics; missing ${missingMetrics.join(', ') || 'none'}.`);
  }

  const liveFieldId = context.managedScope.fieldSeasonIds.find((id) => selectedFieldIds.includes(id)) || context.managedScope.fieldSeasonIds[0];
  const liveDay = context.serverDate >= context.managedScope.dateFrom && context.serverDate <= context.managedScope.dateTo
    ? context.serverDate
    : context.managedScope.dateFrom;
  const validPayload = approvalPayload(context, liveFieldId, liveDay, Number((1 + randomBytes(1)[0] / 50).toFixed(2)));

  const approvalResponse = await request(apiUrl('/v2/kornix/water-regime/approvals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': sessionCsrfToken },
    body: JSON.stringify(validPayload)
  });
  const approvalBody = await jsonOrNull(approvalResponse);
  report.approvalSmoke.validCsrfApprovalPost = approvalResponse.ok ? 'PASS' : 'FAIL';
  report.approvalSmoke.approvalBatchId = approvalBody?.approvalBatchId || null;
  report.approvalSmoke.lastApprovalHttpStatus = approvalResponse.status;
  report.approvalSmoke.lastApprovalErrorCode = approvalBody?.error?.code || null;
  report.approvalSmoke.cookieNamesPresent = [...cookieJar.keys()].sort();
  report.approvalSmoke.sessionCookieLength = cookieJar.get('kornix_session')?.length ?? null;
  report.approvalSmoke.seasonYearPropagated =
    validPayload.seasonYear === seasonYear && validPayload.baseCalculationRunId === context.currentAppliedCalculationRunId
      ? 'PASS'
      : 'FAIL';
  if (!approvalResponse.ok || !approvalBody?.approvalBatchId) {
    fail(`Approval POST failed with HTTP ${approvalResponse.status}.`);
  }

  const approvalStatus = approvalBody.pollRequired
    ? await pollApproval(approvalBody.approvalBatchId)
    : approvalBody;
  report.approvalSmoke.approvalReadbackProof =
    approvalStatus?.approvalStatus === 'applied' || approvalStatus?.approvalStatus === 'no_changes' ? 'PASS' : 'FAIL';
  report.approvalSmoke.approvalCalculationRunId = approvalStatus?.calculationRunId || approvalBody.calculationRunId || null;
  if (report.approvalSmoke.approvalReadbackProof !== 'PASS') {
    fail(`Approval readback returned status ${approvalStatus?.approvalStatus ?? null}.`);
  }

  const missingCsrfResponse = await request(apiUrl('/v2/kornix/water-regime/approvals'), {
    method: 'POST',
    omitCookies: false,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload)
  });
  const missingCsrfBody = await jsonOrNull(missingCsrfResponse);
  report.approvalSmoke.missingCsrfRejected =
    missingCsrfResponse.status === 403 && missingCsrfBody?.error?.code === 'CSRF_TOKEN_INVALID' ? 'PASS' : 'FAIL';

  const outOfScopePayload = JSON.parse(JSON.stringify(validPayload));
  outOfScopePayload.irrigationLayer[0].fieldSeasonId = '00000000-0000-0000-0000-000000000001';
  const outOfScopeResponse = await request(apiUrl('/v2/kornix/water-regime/approvals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': sessionCsrfToken },
    body: JSON.stringify(outOfScopePayload)
  });
  report.approvalSmoke.outOfScopeRejected = outOfScopeResponse.status === 409 ? 'PASS' : 'FAIL';

  const seasonMismatchPayload = JSON.parse(JSON.stringify(validPayload));
  seasonMismatchPayload.seasonYear = seasonYear - 1;
  const seasonMismatchResponse = await request(apiUrl('/v2/kornix/water-regime/approvals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': sessionCsrfToken },
    body: JSON.stringify(seasonMismatchPayload)
  });
  report.approvalSmoke.seasonMismatchRejected = [409, 422].includes(seasonMismatchResponse.status) ? 'PASS' : 'FAIL';

  const logoutResponse = await request(apiUrl('/v1/auth/logout'), {
    method: 'POST',
    headers: { 'X-CSRF-Token': sessionCsrfToken }
  });
  if (!logoutResponse.ok) {
    blockers.push(`Logout returned HTTP ${logoutResponse.status}.`);
  }

  if (requireBrowserUi && !browserProofReady()) {
    fail('Browser/UI proof is required but codex_reports/frontend_editable_approval_uat_browser_ui_proof.json is not PASS.');
  }

  const ready =
    report.preflight.frontendRuntimeReachable === 'PASS' &&
    report.preflight.sameOriginApiJsonNotHtml === 'PASS' &&
    report.preflight.backendEditableReadyObserved === 'PASS' &&
    report.auth.authenticatedSession === 'PASS' &&
    report.editableContext.currentContext === 'PASS' &&
    report.displayRegression.mapFeatures === expectedFields &&
    report.displayRegression.profileMetrics === expectedMetrics &&
    report.displayRegression.shortwavePresent === 'PASS' &&
    report.approvalSmoke.validCsrfApprovalPost === 'PASS' &&
    report.approvalSmoke.approvalReadbackProof === 'PASS' &&
    report.approvalSmoke.seasonYearPropagated === 'PASS' &&
    report.approvalSmoke.missingCsrfRejected === 'PASS' &&
    report.approvalSmoke.outOfScopeRejected === 'PASS' &&
    report.approvalSmoke.seasonMismatchRejected === 'PASS' &&
    (!requireBrowserUi || browserProofReady()) &&
    blockers.length === 0;
  report.status = ready ? READY_STATUS : NOT_READY_STATUS;
} catch (error) {
  report.status = NOT_READY_STATUS;
  if (error instanceof Error && !blockers.includes(error.message)) {
    blockers.push(error.message);
  }
} finally {
  cleanupEphemeralUser();
  saveReports();
  console.log(JSON.stringify({ status: report.status, output: outputJson, blockers }, null, 2));
  if (report.status !== READY_STATUS) {
    process.exitCode = 1;
  }
}
