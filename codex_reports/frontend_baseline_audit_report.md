# KORNIX Frontend Baseline Audit Report

## 1. Executive summary

Baseline-аудит выполнен для `/home/zenbook/site` на ветке `main`.
Фактический frontend — React 18 + TypeScript + Vite SPA с Leaflet, Recharts и
TanStack Query. Runtime-архитектура ориентирована на backend HTTP API: auth и
session endpoints находятся на `/api/v1`, пользовательский KORNIX contour — на
`/api/v2/kornix`, production API base — `/api`.

Итоговый статус: `FRONTEND_BASELINE_AUDITED_ENV_LIMITED`. Production Docker
build проходит, static security/contract scan проходит, backend health
доступен. Ограничения: в WSL нет `node/npm`, локальный Windows Node не подходит
для WSL `node_modules` Rollup native package, lint/test scripts отсутствуют, а
полный backend API smoke требует authenticated server-side session.

## 2. Repository identity

- Path: `/home/zenbook/site`
- Branch: `main`
- Remote: `origin git@github.com:kornix-tech/kornix_site.git`
- Initial HEAD before this audit commit: `49e1232 chore(security): finalize frontend Stage 1 VDS reports`
- Audit commit: `364386e docs: add KORNIX frontend baseline audit report`
- Initial working tree: not clean after required stale `codex_reports/` cleanup.
- Package manager: npm (`package-lock.json`).
- Main build files: `package.json`, `vite.config.ts`, `Dockerfile`, `Dockerfile.prod`, `nginx.conf`.

## 3. Context files read

Historical context files requested by the instruction were not present in the
repository or on `C:\Users\Zenbook\Desktop` next to the provided instructions:

- `KORNIX_EXTERNAL_CONTEXT_AFTER_API_STITCHING_AND_RELEASE_PLAN.md`
- `KORNIX_VDS_PRODUCTION_DEPLOYMENT_RUNBOOK.md`
- `KORNIX_VDS_SECURITY_DOCUMENTATION_CODEX_ADDENDUM.md`
- `KORNIX_NEW_CHAT_CONTEXT_20260531_AFTER_DB92_AND_FRONTEND_API.md`
- `KORNIX_20260530_1633.md`
- `_expert_chatgpt_work_protocol.md`

This is not a task blocker under the audit instruction.

## 4. Current implemented architecture

- Framework/build: implemented. React + TypeScript + Vite in `package.json` and `vite.config.ts`.
- Entrypoints: implemented. `src/main.tsx`, `src/App.tsx`.
- Routing/pages: implemented. Protected workspace routes and `/login` via React Router.
- API client: implemented. `src/shared/api/httpClient.ts` and `src/api/kornixApi.ts`.
- Auth/session: implemented. `src/features/auth/*` uses BFF session model and mock local mode.
- CSRF: implemented. Unsafe methods bootstrap `/api/v1/auth/csrf`, send `X-CSRF-Token`, retry once on `CSRF_TOKEN_INVALID`.
- KORNIX current context: implemented. `WorkspacePage` fetches current context and uses `currentAppliedCalculationRunId`.
- Irrigation layer/current: implemented. `IrrigationInputTable` fetches `/irrigation-layer/current`.
- Approval workflow: implemented. Approval POST, polling, context refresh on stale base.
- Calculation run polling/status: implemented for approval and helper endpoint.
- Map: implemented with Leaflet and backend GeoJSON.
- Profile/timeseries chart: implemented with Recharts and backend profile-timeseries endpoint.
- Method selector: implemented through `availableMethods`, `defaultMethodCode`, URL state and map/profile queries.
- Error/session UX: partial but present. Auth guard handles loading/error/anonymous; API errors preserve backend envelope.
- Environment: implemented. `.env.*.example` and production defaults document `/api`.
- Docker/prod serving: implemented. Docker multi-stage build and Nginx static server with SPA fallback.
- Tests/lint/build: build/typecheck available; lint/test scripts absent.
- Security docs/README: implemented baseline docs under `doc/security/` and README security sections.

## 5. API client and endpoint usage

Allowed endpoints found in runtime code:

- `GET /api/v1/me`
- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v2/kornix/current-context`
- `GET /api/v2/kornix/irrigation-layer/current`
- `POST /api/v2/kornix/water-regime/approvals`
- `GET /api/v2/kornix/water-regime/approvals/{approvalBatchId}`
- `GET /api/v2/kornix/water-regime/calculation-runs/{calculationRunId}`
- `GET /api/v2/kornix/field-seasons/map`
- `GET /api/v2/kornix/water-regime/profile-timeseries`
- `GET /api/v2/kornix/methods`

Additional runtime endpoints:

- `GET /api/v2/kornix/readiness/current`
- `GET /api/v2/kornix/field-seasons/catalog`

Forbidden endpoint scan:

- No runtime `src` calls to `/api/v1/kornix`.
- No runtime `src` calls to backend-admin API.
- Documentation contains historical legacy `/api/v1/kornix` references; classified as documentation-only.

## 6. Auth/session/CSRF status

Implemented:

- `BffSessionAuthClient` uses `/api/v1/me`, `/api/v1/auth/login`, `/api/v1/auth/logout`.
- `requestJson` sends `credentials: include`.
- `401` dispatches an auth-required event and AuthProvider returns anonymous state.
- `403` is surfaced as forbidden API error.
- CSRF token is fetched for unsafe methods and sent as `X-CSRF-Token`.
- Token refresh/retry exists for backend code `CSRF_TOKEN_INVALID`.

Browser storage classification:

- `localStorage`: non-authoritative irrigation draft only.
- `sessionStorage`: local mock-auth demo flag only.
- `IndexedDB`: no runtime usage found.
- Auth token storage risk: absent by scan.

## 7. Current-context / irrigation-layer / approval workflow status

Expected workflow is mostly implemented:

1. Auth user/session is loaded through `/api/v1/me`.
2. Current context is fetched through `/api/v2/kornix/current-context`.
3. Active irrigation layer is fetched through `/api/v2/kornix/irrigation-layer/current`.
4. Map/profile use `currentAppliedCalculationRunId`, selected method and backend dates.
5. User edits only managed field/date scope.
6. Approval POST sends strict `managedScope`, positive `irrigationLayer` and `clientDiff`.
7. Approval polling follows backend status.
8. On applied/completed state, UI refetches active layer/context and switches calculation run.
9. Local draft is not treated as approved source of truth.

Risk: full end-to-end approval smoke was not executed because authenticated backend session was unavailable.

## 8. Map/profile/charts status

- Map: implemented in `src/workspace/FieldMap.tsx`; renders GeoJSON polygons with status/metric modes.
- Tooltip: escapes HTML before rendering field labels and properties.
- Profile chart: implemented in `src/workspace/WaterRegimeChart.tsx`.
- DTO null handling: code generally preserves `null` and formats missing values as no data; no blanket null-to-zero production conversion was found.
- Main frontend identity: `fieldSeasonId` is used for selection, map/profile and irrigation edits.

DTO coverage note: current DTO names in code mostly follow existing backend long names such as
`soil_water_content_mm`, `precipitation_effective_daily_mm` and
`irrigation_effective_daily_mm`. The audit did not find direct frontend fields
named exactly `currentWaterPercent`, `currentWaterMm`, `availableWaterMm`,
`waterDemandMm`, `precipitationMm`, `actualIrrigationMm`,
`effectiveIrrigationMm`, `recommendedIrrigationMm`; equivalent display values
are derived or represented through current API DTOs. Backend/frontend DTO naming
should remain aligned before declaring a broader API-ready status.

## 9. Environment and production build status

- Production API base `/api`: documented and used by Docker build args/env examples.
- Local dev base `http://localhost:8001`: documented and proxied by Vite `/api` proxy.
- Mock runtime: guarded by local-host runtime safety.
- Docker build: passed with `npm ci`, typecheck and Vite build inside `node:20-alpine`.
- Local WSL build: not available because WSL PATH lacks Node/npm.
- Local Windows Node build from UNC: failed due missing Windows Rollup optional native package in WSL `node_modules`.

## 10. VDS/security status

Security readiness baseline:

- No frontend secrets expected in `VITE_*`; docs warn that `VITE_*` is public bundle config.
- No auth tokens stored in browser storage by runtime scan.
- Backend session cookie model is documented and implemented on frontend side.
- CSRF handling exists for unsafe methods.
- Backend-admin and legacy KORNIX v1 runtime calls absent.
- Direct DB/KML/Python runtime readers absent. KML text appears in mock fixture messages, classified as mock/static fixture provenance.
- Nginx sets CSP and security headers.
- VDS topology/firewall/deploy docs exist.

Security remains `partial` because authenticated production/VDS smoke and backend authorization/CSRF negative tests were not executed in this audit.

## 11. Documentation status

Security documentation completeness: PASS.

Material files exist:

- `doc/security/KORNIX_FRONTEND_SECURITY_ARCHITECTURE.md`
- `doc/security/KORNIX_FRONTEND_AUTH_SESSION.md`
- `doc/security/KORNIX_FRONTEND_PRODUCTION_BUILD.md`
- `doc/security/KORNIX_FRONTEND_VDS_DEPLOYMENT.md`
- `doc/security/KORNIX_FRONTEND_SECURITY_TEST_PLAN.md`

README was updated with the current baseline status and report index.
CHANGELOG was updated with the baseline audit report entry.

## 12. Test/check results

- install: PASS via Docker build `npm ci`; local WSL `npm ci` NOT_RUN because `npm` is not installed in WSL PATH.
- typecheck: PASS via bundled Node TypeScript and Docker build.
- lint: NOT_RUN because `package.json` has no lint script.
- tests: NOT_RUN because `package.json` has no test script.
- build: PASS via Docker production build; local Windows Node Vite build failed due Rollup native optional package mismatch.
- docker build: PASS.
- docker compose config: PASS.
- docker compose dev config: PASS.
- forbidden_pattern_audit: PASS.

Logs:

- `codex_reports/frontend_test_log.txt`
- `codex_reports/frontend_static_security_scan.txt`
- `codex_reports/frontend_docker_build_log.txt`
- `codex_reports/frontend_backend_smoke_log.txt`

## 13. Runtime/API smoke results

- `GET http://localhost:8001/api/v1/health`: reachable, returned `{"status":"ok"}`.
- `GET http://localhost:8001/api/v2/kornix/current-context`: reachable but returned `SESSION_REQUIRED`, which is expected without authenticated server-side session.

No browser/e2e smoke was invented because the repository does not include a configured e2e smoke harness.

## 14. Git status

Required stale generated files inside `codex_reports/` were removed and the report set was recreated.
Final git status is saved to `codex_reports/frontend_git_status.txt`.
Changed files are saved to `codex_reports/frontend_changed_files.txt`.

## 15. Blockers

- Local WSL environment lacks Node/npm for direct `npm ci` and local npm scripts.
- Local Windows Node cannot use Linux/WSL Rollup optional native dependency.
- No lint/test scripts are configured.
- Full authenticated backend integration smoke requires a valid session.

## 16. Risks

- Security docs are present, but production security is not fully proven until authenticated VDS smoke and backend negative tests are run.
- Historical docs still contain legacy `/api/v1/kornix` examples; they are documentation-only but can confuse future readers if not clearly marked as historical.
- Mock fixture provenance strings mention KML; they are not a KML runtime reader, but static mock data may still be bundled if imports are not fully tree-shaken.

## 17. Recommended next steps

- Add explicit `lint` and `test` scripts or document that they are intentionally absent.
- Install Node/npm inside WSL or standardize all checks through Docker/Make.
- Run authenticated backend smoke with a real test session and verify login, current-context, map/profile and approval workflow.
- Consider marking old v0.1 API docs as historical at the top of each file.
- Add automated CI contract scan for forbidden endpoints and token storage.

## 18. Final status

`FRONTEND_BASELINE_AUDITED_ENV_LIMITED`
