# Frontend API v2 SP37 live report

Status: **KORNIX_FRONTEND_API_V2_SP37_LIVE_READY**

Generated at: 2026-06-08T00:00:00+03:00

## Preflight

- frontend commit before work: a000e7de635a9e2a2bc0d3e9878c2344cb6a3608
- backend commit observed: 2a97f3e6fafc23c9d69b9157c75be691ed710460
- backend runtime reachable: PASS
- backend session secret fix observed: PASS_VIA_KORNIX_API_SESSION_SECRET_FILE

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

- authenticated session: PASS
- /api/v1/me organization: SP
- current-context: PASS
- currentAppliedCalculationRunId: kornix_api_c0c083c7d01951d88d00bb29ffe40b21
- map features: 37
- profile metrics: 13
- required metrics present: PASS
- shortwave present: PASS
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

- none

## Reports

- codex_reports/frontend_api_v2_sp37_live_report.md
- codex_reports/frontend_api_v2_sp37_live_report.json
- codex_reports/frontend_api_v2_sp37_live_smoke.json
- codex_reports/frontend_api_v2_sp37_credentials_gate.json
- codex_reports/frontend_api_v2_sp37_final_preflight.json
