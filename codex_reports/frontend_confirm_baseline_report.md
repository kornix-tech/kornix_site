# KORNIX Frontend Baseline Confirmation Report

## 1. Executive summary

Confirmation pass completed for `/home/zenbook/site` on `main` after the
GitHub ZIP 19-18 baseline review. The current frontend remains aligned with the
API v2 frontend contract, BFF/session client behavior, CSRF handling,
production `/api` base and Docker build/deploy path.

Final status: `FRONTEND_BASELINE_CONFIRMED_ENV_LIMITED`.

The confirmation is environment-limited because WSL still has no `node`/`npm`,
the repository has no lint/test scripts, and full authenticated backend smoke
was not available. Dockerized npm install/typecheck/build and Docker production
build passed.

## 2. Initial baseline status

Initial evidence is saved in
`codex_reports/frontend_confirm_initial_state.txt`.

Current HEAD before this confirmation pass:

```text
91ed6ad docs: update KORNIX frontend baseline audit metadata
```

The previous audit status was
`FRONTEND_BASELINE_AUDITED_ENV_LIMITED`.

## 3. Endpoint/security scan

Report: `codex_reports/frontend_confirm_forbidden_pattern_audit.txt`.

Result: PASS.

- Production defects: none found in runtime `src`.
- Runtime `/api/v1/kornix` calls: none.
- Runtime `/api/admin/*` calls: none.
- Browser auth token storage: none.
- `sessionStorage` finding is local mock-auth flag only.
- `localStorage` finding is non-authoritative irrigation draft state only.
- KML text appears only as static fixture provenance; frontend does not read KML
  at runtime.

## 4. API workflow confirmation

Report: `codex_reports/frontend_confirm_api_workflow.md`.

Result: PASS by static runtime code inspection.

- `/api/v1/me` session check is implemented.
- `/api/v2/kornix/current-context` is used for current context.
- `/api/v2/kornix/irrigation-layer/current` is used for backend projection.
- `currentAppliedCalculationRunId` remains the displayed/applied run source.
- Approval POST, CSRF, polling and refetch-after-apply are implemented.

## 5. Build/check results

Report: `codex_reports/frontend_confirm_test_log.txt`.

- WSL `node --version`: NOT_RUN, `node` not found.
- WSL `npm --version`: NOT_RUN, `npm` not found.
- Dockerized `npm ci`: PASS.
- Dockerized `npm run typecheck`: PASS.
- Dockerized `npm run build`: PASS.
- `npm run lint`: NOT_RUN, no script.
- `npm test`: NOT_RUN, no script.
- `docker build -t kornix-frontend-confirm-baseline .`: PASS.
- Docker compose config export: PASS.

## 6. Backend integration smoke

Report: `codex_reports/frontend_confirm_backend_smoke_log.txt`.

- `GET http://localhost:8001/api/v1/health`: PASS, returned `{"status":"ok"}`.
- `GET http://localhost:8001/api/v2/kornix/current-context`: returned `200`
  with `frontendMode:not_ready`.
- `GET /api/v1/auth/csrf`: PASS.
- `GET /api/v2/kornix/methods`: PASS.
- `GET /api/v2/kornix/irrigation-layer/current`: PASS.

Observation: the local backend returned current-context without an explicit
authenticated browser session. This is recorded as a backend auth-boundary item
for follow-up; frontend code still uses the BFF/session client and does not
weaken auth.

Authenticated approval/map/profile smoke was not run because no browser session
or non-destructive approval harness was available.

## 7. Documentation status

Security docs remain present and project-specific:

- `doc/security/KORNIX_FRONTEND_SECURITY_ARCHITECTURE.md`
- `doc/security/KORNIX_FRONTEND_AUTH_SESSION.md`
- `doc/security/KORNIX_FRONTEND_PRODUCTION_BUILD.md`
- `doc/security/KORNIX_FRONTEND_VDS_DEPLOYMENT.md`
- `doc/security/KORNIX_FRONTEND_SECURITY_TEST_PLAN.md`

No README or docs changes were required.

## 8. Changed files

Changed files are saved in
`codex_reports/frontend_changed_files.txt`.

This pass changes confirmation reports only.

## 9. Remaining blockers

- WSL environment has no direct `node`/`npm`; Dockerized npm/build path passed.
- No lint/test scripts are defined in `package.json`.
- Full authenticated backend/browser smoke was not run.
- Local backend current-context returned `200` without an explicit session;
  backend auth-boundary behavior should be reviewed separately.

## 10. Final status

`FRONTEND_BASELINE_CONFIRMED_ENV_LIMITED`
