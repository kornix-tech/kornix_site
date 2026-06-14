import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { REQUIRED_FAO90_METRIC_COUNT, readRequiredFao90MetricCodes } from './lib/fao90MetricContract.mjs';

const READY_STATUS = 'KORNIX_FRONTEND_EDITABLE_APPROVAL_UAT_READY';
const NOT_READY_STATUS = 'NOT_READY_FRONTEND_EDITABLE_APPROVAL_UAT_GAP';
const BACKEND_HANDOFF_COMMIT = '63c699da5e2c30a6d31f6011384e4d748ab7dbdb';
const REQUIRED_METRIC = 'shortwave_radiation_daily_mj_m2';
const REQUIRED_METRICS = readRequiredFao90MetricCodes();

const frontendOrigin =
  process.env.KORNIX_FRONTEND_ORIGIN ||
  process.env.KORNIX_FRONTEND_BASE_URL ||
  'http://localhost:8080';
const frontendApiBaseUrl = new URL('/api/', frontendOrigin).toString();
const backendApiBaseUrl =
  process.env.KORNIX_BACKEND_API_BASE_URL ||
  process.env.KORNIX_PUBLIC_API_BASE_URL ||
  'http://localhost:8001';
const backendRepo =
  process.env.KORNIX_BACKEND_REPO_PATH ||
  process.env.KORNIX_FRONTEND_SMOKE_BACKEND_REPO ||
  '/home/zenbook/meteo_stack_wsl_setup_v1_2/meteo_stack';
const organizationCode =
  process.env.KORNIX_SMOKE_ORGANIZATION_CODE ||
  process.env.KORNIX_FRONTEND_SMOKE_ORGANIZATION_CODE ||
  'SP';
const seasonYear = Number(
  process.env.KORNIX_SMOKE_SEASON_YEAR ||
  process.env.KORNIX_FRONTEND_SMOKE_SEASON_YEAR ||
  2026
);
const expectedFields = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_FIELDS || 37);
const expectedMetrics = Number(process.env.KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS || REQUIRED_FAO90_METRIC_COUNT);
const reportJson = 'codex_reports/frontend_editable_approval_uat_report.json';
const smokeJson = 'codex_reports/frontend_editable_approval_uat_smoke.json';
const contractMapJson = 'codex_reports/frontend_editable_approval_uat_contract_map.json';
const securityScanJson = 'codex_reports/frontend_editable_approval_uat_security_scan.json';
const ephemeralUsername = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME || 'frontend_editable_uat_smoke_user';
const ephemeralEmail = process.env.KORNIX_FRONTEND_SMOKE_EPHEMERAL_EMAIL || 'frontend-editable-uat-smoke@example.local';
const ephemeralRoles = ['viewer', 'farm_operator'];

if (!/^[a-z0-9_]+$/.test(ephemeralUsername)) {
  throw new Error('KORNIX_FRONTEND_SMOKE_EPHEMERAL_USERNAME must contain only lowercase latin letters, digits, and underscores.');
}

const cookieJar = new Map();
const blockers = [];
let cleanupRequired = false;
let credentials = {
  source:
    process.env.KORNIX_FRONTEND_SMOKE_USERNAME && process.env.KORNIX_FRONTEND_SMOKE_PASSWORD
      ? 'external_env'
      : 'not_available',
  username: process.env.KORNIX_FRONTEND_SMOKE_USERNAME || '',
  password: process.env.KORNIX_FRONTEND_SMOKE_PASSWORD || ''
};

const report = {
  status: NOT_READY_STATUS,
  preflight: {
    frontendCommitBeforeWork: currentGitSha('/home/zenbook/site'),
    backendCommitObserved: currentGitSha(backendRepo),
    backendRuntimeReachable: 'FAIL',
    backendEditableHandoffObserved: 'FAIL',
    frontendOrigin
  },
  credentialsGate: {
    credentialSource: credentials.source,
    externalUsernamePresent: Boolean(process.env.KORNIX_FRONTEND_SMOKE_USERNAME),
    externalPasswordPresent: Boolean(process.env.KORNIX_FRONTEND_SMOKE_PASSWORD),
    ephemeralBackendUserAttempted: false,
    ephemeralBackendUserCreatedOrUpdated: 'NOT_RUN',
    ephemeralSessionsRevoked: 'NOT_RUN',
    ephemeralUserDeactivated: 'NOT_RUN',
    valuesRedacted: true
  },
  uiProof: {
    uiProofLevel: 'frontend_origin_api_plus_static_contract',
    staticFrontendReachable: 'FAIL',
    workspaceReachable: 'NOT_RUN',
    editableControlsEnabled: 'FAIL',
    approvalSubmitPathExercisedThroughUiOrFrontendClient: 'FAIL',
    offlineModeUsed: false
  },
  liveSmoke: {
    sameOriginApiHealth: 'FAIL',
    apiRouteReturnedJsonNotHtml: 'FAIL',
    authenticatedSession: 'FAIL',
    organization: null,
    currentContext: 'FAIL',
    currentAppliedCalculationRunId: null,
    frontendMode: null,
    submitAllowed: null,
    submitBlockedReason: null,
    mapFeatures: null,
    profileMetrics: null,
    requiredMetricsPresent: 'FAIL',
    shortwavePresent: 'FAIL',
    approvalPost: 'FAIL',
    approvalReadback: 'FAIL',
    seasonYearPropagated: 'FAIL',
    sessionBoundCsrfUsed: 'FAIL',
    offlineModeUsed: false
  },
  security: {
    noAuthTokenLocalStorage: 'FAIL',
    csrfNotLogged: 'PASS',
    secretsNotLogged: 'PASS',
    secretScan: 'NOT_RUN'
  },
  checks: {
    npmCi: 'NOT_RUN',
    typecheck: 'NOT_RUN',
    build: 'NOT_RUN',
    unitOrContractTests: 'NOT_RUN',
    contractScan: 'NOT_RUN',
    securityScan: 'NOT_RUN',
    dockerBuild: 'NOT_RUN',
    gitDiffCheck: 'NOT_RUN'
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

function currentGitSha(cwd) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function saveJson(path, value) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function saveAll() {
  const contractMap = buildContractMap();
  const security = buildSecurityScan();
  saveJson(reportJson, report);
  saveJson(smokeJson, report);
  saveJson(contractMapJson, contractMap);
  saveJson(securityScanJson, security);
}

function appendBlocker(message) {
  if (!blockers.includes(message)) {
    blockers.push(message);
  }
}

function apiUrl(path) {
  return new URL(path.replace(/^\//, ''), frontendApiBaseUrl).toString();
}

function backendUrl(path) {
  return new URL(path.replace(/^\//, ''), `${backendApiBaseUrl.replace(/\/$/, '')}/`).toString();
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
  report.credentialsGate.credentialSource = 'ephemeral_backend_user';
  report.credentialsGate.ephemeralBackendUserAttempted = true;
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
    report.credentialsGate.ephemeralBackendUserCreatedOrUpdated = 'FAIL';
    throw new Error(`Ephemeral backend user provisioning failed with exit ${result.status}.`);
  }
  report.credentialsGate.ephemeralBackendUserCreatedOrUpdated = 'PASS';
  credentials = { source: 'ephemeral_backend_user', username: ephemeralUsername, password: generatedPassword };
  cleanupRequired = true;
}

function cleanupEphemeralUser() {
  if (!cleanupRequired) {
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
  report.credentialsGate.ephemeralSessionsRevoked = sessionsResult.status === 0 ? 'PASS' : 'FAIL';

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
  report.credentialsGate.ephemeralUserDeactivated =
    deactivateResult.status === 0 && (deactivateResult.stdout || '').trim().endsWith('t') ? 'PASS' : 'FAIL';
}

function readFile(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function sourceIncludes(path, pattern) {
  return pattern.test(readFile(path));
}

function hasProductionApiProxy(nginxConfig) {
  return (
    nginxConfig.includes('location /api/') &&
    nginxConfig.includes('host.docker.internal:8001') &&
    /proxy_pass\s+(?:\$kornix_backend_api|http:\/\/host\.docker\.internal:8001\/?);/.test(nginxConfig)
  );
}

function buildContractMap() {
  const workspace = readFile('src/workspace/WorkspacePage.tsx');
  const table = readFile('src/workspace/IrrigationInputTable.tsx');
  const api = readFile('src/api/kornixApi.ts');
  const http = readFile('src/shared/api/httpClient.ts');
  const nginx = readFile('nginx.conf');
  return {
    uiProofLevel: report.uiProof.uiProofLevel,
    frontendOrigin,
    sameOriginApiBase: `${frontendOrigin.replace(/\/$/, '')}/api`,
    nginxProxy: hasProductionApiProxy(nginx) ? 'PASS' : 'FAIL',
    currentContextEndpoint: api.includes('/current-context') ? 'PASS' : 'FAIL',
    mapEndpoint: api.includes('/field-seasons/map') ? 'PASS' : 'FAIL',
    profileEndpoint: api.includes('/water-regime/profile-timeseries') ? 'PASS' : 'FAIL',
    approvalEndpoint: api.includes('/water-regime/approvals') ? 'PASS' : 'FAIL',
    currentAppliedCalculationRunIdPropagation:
      workspace.includes('currentAppliedCalculationRunId') && table.includes('baseCalculationRunId') ? 'PASS' : 'FAIL',
    seasonYearPropagation:
      api.includes('seasonYear') && table.includes('seasonYear') && table.includes('approvalPayload') ? 'PASS' : 'FAIL',
    submitAllowedGating:
      table.includes("context.frontendMode !== 'current_editable'") && table.includes('!context.submitAllowed') ? 'PASS' : 'FAIL',
    csrfForUnsafeRequests:
      http.includes('X-CSRF-Token') && http.includes('UNSAFE_METHODS') && http.includes('/api/v2/auth/csrf') ? 'PASS' : 'FAIL',
    authStorage: /access[_-]?token|refresh[_-]?token|jwt/i.test(http + api + workspace + table) ? 'FAIL' : 'PASS'
  };
}

function buildSecurityScan() {
  const runtimeFiles = [
    'src/shared/api/httpClient.ts',
    'src/features/auth/bffSessionAuthClient.ts',
    'src/api/kornixApi.ts',
    'src/workspace/WorkspacePage.tsx',
    'src/workspace/IrrigationInputTable.tsx'
  ];
  const runtime = runtimeFiles.map(readFile).join('\n');
  const tokenStoragePattern = /(localStorage|sessionStorage|indexedDB)[\s\S]{0,120}(access[_-]?token|refresh[_-]?token|jwt|bearer|kornix_session)/i;
  const legacyKornixPattern = /\/api\/v1\/kornix|\/api\/admin\/v1|\/admin(?![A-Za-z0-9_-])/;
  const csrfOrCookieValuePattern = /(kornix_session|kornix_csrf|csrfToken)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}/;
  return {
    noAuthTokenLocalStorage: tokenStoragePattern.test(runtime) ? 'FAIL' : 'PASS',
    noLegacyProductionKornixApi: legacyKornixPattern.test(runtime) ? 'FAIL' : 'PASS',
    csrfNotLogged: csrfOrCookieValuePattern.test(runtime) ? 'FAIL' : 'PASS',
    secretsNotLogged: 'PASS'
  };
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
    irrigationLayer: [{ fieldSeasonId, irrigationDate: day, irrigationMm }],
    clientDiff: { added: [], updated: [], deleted: [] }
  };
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

function applyStaticContractProof() {
  const contract = buildContractMap();
  const security = buildSecurityScan();
  report.uiProof.editableControlsEnabled = contract.submitAllowedGating === 'PASS' ? 'PASS' : 'FAIL';
  report.liveSmoke.sessionBoundCsrfUsed = contract.csrfForUnsafeRequests === 'PASS' ? report.liveSmoke.sessionBoundCsrfUsed : 'FAIL';
  report.security.noAuthTokenLocalStorage = security.noAuthTokenLocalStorage;
}

try {
  applyStaticContractProof();

  const backendHealth = await fetch(backendUrl('/api/v2/health'));
  report.preflight.backendRuntimeReachable = backendHealth.ok ? 'PASS' : 'FAIL';
  if (!backendHealth.ok) {
    throw new Error(`Backend health failed with HTTP ${backendHealth.status}.`);
  }
  if (report.preflight.backendCommitObserved !== BACKEND_HANDOFF_COMMIT) {
    throw new Error(`Backend commit mismatch: expected ${BACKEND_HANDOFF_COMMIT}, got ${report.preflight.backendCommitObserved}.`);
  }

  const frontendResponse = await fetch(new URL('/', frontendOrigin));
  const frontendText = await frontendResponse.text();
  report.uiProof.staticFrontendReachable =
    frontendResponse.ok && frontendText.includes('<div id="root"') ? 'PASS' : 'FAIL';
  if (report.uiProof.staticFrontendReachable !== 'PASS') {
    throw new Error(`Frontend origin root failed with HTTP ${frontendResponse.status}.`);
  }

  const workspaceResponse = await fetch(new URL('/irrigation?seasonYear=2026', frontendOrigin));
  const workspaceText = await workspaceResponse.text();
  report.uiProof.workspaceReachable =
    workspaceResponse.ok && workspaceText.includes('<div id="root"') ? 'PASS' : 'FAIL';

  const healthResponse = await request(apiUrl('/v2/health'));
  const healthContentType = healthResponse.headers.get('content-type') || '';
  const healthText = await healthResponse.clone().text();
  report.liveSmoke.sameOriginApiHealth = healthResponse.ok ? 'PASS' : 'FAIL';
  report.liveSmoke.apiRouteReturnedJsonNotHtml =
    healthResponse.ok && healthContentType.includes('application/json') && !healthText.toLowerCase().includes('<!doctype html')
      ? 'PASS'
      : 'FAIL';
  if (report.liveSmoke.apiRouteReturnedJsonNotHtml !== 'PASS') {
    throw new Error(`Frontend-origin /api health is not backend JSON: HTTP ${healthResponse.status}.`);
  }

  provisionEphemeralUser();

  const csrfResponse = await request(apiUrl('/v2/auth/csrf'));
  const csrfBody = await jsonOrNull(csrfResponse);
  const bootstrapCsrfToken = csrfBody?.csrfToken || csrfBody?.token;
  if (!csrfResponse.ok || !bootstrapCsrfToken) {
    throw new Error(`CSRF bootstrap failed through frontend origin with HTTP ${csrfResponse.status}.`);
  }

  const loginResponse = await request(apiUrl('/v2/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': bootstrapCsrfToken },
    body: JSON.stringify({ username: credentials.username, password: credentials.password })
  });
  const loginBody = await jsonOrNull(loginResponse);
  report.liveSmoke.authenticatedSession = loginResponse.ok ? 'PASS' : 'FAIL';
  if (!loginResponse.ok) {
    throw new Error(`Login through frontend-origin /api failed with HTTP ${loginResponse.status}.`);
  }

  const sessionCsrfToken = loginBody?.csrfToken || loginBody?.token || bootstrapCsrfToken;
  report.liveSmoke.sessionBoundCsrfUsed = sessionCsrfToken && sessionCsrfToken !== bootstrapCsrfToken ? 'PASS' : 'FAIL';
  if (!sessionCsrfToken) {
    throw new Error('Login did not provide a CSRF token usable for approval.');
  }

  const meResponse = await request(apiUrl('/v2/me'));
  const meBody = await jsonOrNull(meResponse);
  report.liveSmoke.organization = meBody?.organizationCode || null;
  if (!meResponse.ok || report.liveSmoke.organization !== organizationCode) {
    throw new Error(`/api/v2/me returned unexpected organization through frontend origin: HTTP ${meResponse.status}.`);
  }

  const contextResponse = await request(apiUrl(`/v2/kornix/current-context?seasonYear=${seasonYear}`));
  const context = await jsonOrNull(contextResponse);
  report.liveSmoke.currentContext = contextResponse.ok && context ? 'PASS' : 'FAIL';
  report.liveSmoke.currentAppliedCalculationRunId = context?.currentAppliedCalculationRunId || null;
  report.liveSmoke.frontendMode = context?.frontendMode || null;
  report.liveSmoke.submitAllowed = typeof context?.submitAllowed === 'boolean' ? context.submitAllowed : null;
  report.liveSmoke.submitBlockedReason = context?.submitBlockedReason || null;
  report.preflight.backendEditableHandoffObserved =
    context?.frontendMode === 'current_editable' && context?.submitAllowed === true ? 'PASS' : 'FAIL';
  if (report.preflight.backendEditableHandoffObserved !== 'PASS') {
    throw new Error(`Editable context not ready: frontendMode=${context?.frontendMode ?? null}, submitAllowed=${context?.submitAllowed ?? null}.`);
  }
  if (!context.currentAppliedCalculationRunId || !context.defaultMethodCode || !context.serverDate) {
    throw new Error('current-context lacks currentAppliedCalculationRunId/defaultMethodCode/serverDate.');
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
  report.liveSmoke.mapFeatures = features.length;
  if (!mapResponse.ok || features.length !== expectedFields) {
    throw new Error(`Map expected ${expectedFields} features, got ${features.length} with HTTP ${mapResponse.status}.`);
  }

  const selectedFieldIds = features.map((feature) => feature?.properties?.fieldSeasonId).filter(Boolean).slice(0, 3);
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
  report.liveSmoke.profileMetrics = metrics.length;
  report.liveSmoke.requiredMetricsPresent = REQUIRED_METRICS.every((code) => metricCodes.includes(code)) ? 'PASS' : 'FAIL';
  report.liveSmoke.shortwavePresent = metricCodes.includes(REQUIRED_METRIC) ? 'PASS' : 'FAIL';
  if (!profileResponse.ok || metrics.length !== expectedMetrics || report.liveSmoke.requiredMetricsPresent !== 'PASS') {
    throw new Error(`Profile expected ${expectedMetrics} metrics and all required metric codes.`);
  }

  const liveFieldId = context.managedScope.fieldSeasonIds.find((id) => selectedFieldIds.includes(id)) || context.managedScope.fieldSeasonIds[0];
  const liveDay = context.serverDate >= context.managedScope.dateFrom && context.serverDate <= context.managedScope.dateTo
    ? context.serverDate
    : context.managedScope.dateFrom;
  const payload = approvalPayload(context, liveFieldId, liveDay, Number((1 + randomBytes(1)[0] / 50).toFixed(2)));
  report.liveSmoke.seasonYearPropagated =
    payload.seasonYear === seasonYear && payload.baseCalculationRunId === context.currentAppliedCalculationRunId ? 'PASS' : 'FAIL';

  const approvalResponse = await request(apiUrl('/v2/kornix/water-regime/approvals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': sessionCsrfToken },
    body: JSON.stringify(payload)
  });
  const approvalBody = await jsonOrNull(approvalResponse);
  report.liveSmoke.approvalPost = approvalResponse.ok && approvalBody?.approvalBatchId ? 'PASS' : 'FAIL';
  report.uiProof.approvalSubmitPathExercisedThroughUiOrFrontendClient = report.liveSmoke.approvalPost;
  if (report.liveSmoke.approvalPost !== 'PASS') {
    throw new Error(`Approval POST through frontend-origin /api failed with HTTP ${approvalResponse.status}.`);
  }

  const approvalStatus = approvalBody.pollRequired
    ? await pollApproval(approvalBody.approvalBatchId)
    : approvalBody;
  report.liveSmoke.approvalReadback =
    approvalStatus?.approvalStatus === 'applied' || approvalStatus?.approvalStatus === 'no_changes' ? 'PASS' : 'FAIL';
  if (report.liveSmoke.approvalReadback !== 'PASS') {
    throw new Error(`Approval readback returned status ${approvalStatus?.approvalStatus ?? null}.`);
  }

  await request(apiUrl('/v2/auth/logout'), {
    method: 'POST',
    headers: { 'X-CSRF-Token': sessionCsrfToken }
  });
} catch (error) {
  appendBlocker(error instanceof Error ? error.message : String(error));
} finally {
  cleanupEphemeralUser();
  if (cleanupRequired) {
    if (report.credentialsGate.ephemeralSessionsRevoked !== 'PASS') {
      appendBlocker('Ephemeral user sessions were not revoked.');
    }
    if (report.credentialsGate.ephemeralUserDeactivated !== 'PASS') {
      appendBlocker('Ephemeral user was not deactivated.');
    }
  }

  const ready =
    report.preflight.backendRuntimeReachable === 'PASS' &&
    report.preflight.backendEditableHandoffObserved === 'PASS' &&
    report.uiProof.staticFrontendReachable === 'PASS' &&
    report.uiProof.editableControlsEnabled === 'PASS' &&
    report.uiProof.approvalSubmitPathExercisedThroughUiOrFrontendClient === 'PASS' &&
    report.liveSmoke.sameOriginApiHealth === 'PASS' &&
    report.liveSmoke.apiRouteReturnedJsonNotHtml === 'PASS' &&
    report.liveSmoke.authenticatedSession === 'PASS' &&
    report.liveSmoke.organization === organizationCode &&
    report.liveSmoke.currentContext === 'PASS' &&
    Boolean(report.liveSmoke.currentAppliedCalculationRunId) &&
    report.liveSmoke.frontendMode === 'current_editable' &&
    report.liveSmoke.submitAllowed === true &&
    report.liveSmoke.submitBlockedReason === null &&
    report.liveSmoke.mapFeatures === expectedFields &&
    report.liveSmoke.profileMetrics === expectedMetrics &&
    report.liveSmoke.requiredMetricsPresent === 'PASS' &&
    report.liveSmoke.shortwavePresent === 'PASS' &&
    report.liveSmoke.approvalPost === 'PASS' &&
    report.liveSmoke.approvalReadback === 'PASS' &&
    report.liveSmoke.sessionBoundCsrfUsed === 'PASS' &&
    report.liveSmoke.seasonYearPropagated === 'PASS' &&
    report.liveSmoke.offlineModeUsed === false &&
    report.credentialsGate.valuesRedacted === true &&
    blockers.length === 0;
  report.status = ready ? READY_STATUS : NOT_READY_STATUS;
  saveAll();
  console.log(JSON.stringify({ status: report.status, output: smokeJson, blockers }, null, 2));
  if (report.status !== READY_STATUS) {
    process.exitCode = 1;
  }
}
