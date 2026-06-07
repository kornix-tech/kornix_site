# Frontend API v2 SP37 live report

Status: **NOT_READY_FRONTEND_API_V2_SP37_GAP**

Generated at: 2026-06-08T00:00:00+03:00

## Credentials gate

- credential source: ephemeral_backend_user
- KORNIX_FRONTEND_SMOKE_USERNAME external env present: false
- KORNIX_FRONTEND_SMOKE_PASSWORD external env present: false
- ephemeral backend user attempted: true
- ephemeral backend user created/updated: PASS
- ephemeral sessions revoked: PASS
- ephemeral user deactivated: PASS
- values redacted: true

## Live API smoke

- authenticated session: FAIL
- /api/v1/me organization: null
- current-context: NOT_RUN
- currentAppliedCalculationRunId: null
- map features: null
- profile metrics: null
- required metrics present: NOT_RUN
- shortwave present: NOT_RUN
- mock mode used: false

## Checks

- npm ci: PASS
- typecheck: PASS
- build: PASS
- contract test: PASS
- contract scan: PASS
- security scan: PASS
- secret scan: PASS
- docker build: PASS
- git diff check: PASS

## Blockers

- Login failed with HTTP 500.
- Backend runtime KORNIX_API_SESSION_SECRET is not configured; authenticated session login returns HTTP 500.

## Reports

- codex_reports/frontend_api_v2_sp37_live_report.md
- codex_reports/frontend_api_v2_sp37_live_report.json
- codex_reports/frontend_api_v2_sp37_live_smoke.json
- codex_reports/frontend_api_v2_sp37_credentials_gate.json
