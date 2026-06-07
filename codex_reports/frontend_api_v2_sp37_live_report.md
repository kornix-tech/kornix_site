# Frontend API v2 SP37 live report

Status: **NOT_READY_FRONTEND_API_V2_SP37_GAP**

Generated at: 2026-06-08T00:00:00+03:00

## Credentials gate

- KORNIX_FRONTEND_SMOKE_USERNAME present: false
- KORNIX_FRONTEND_SMOKE_PASSWORD present: false
- values redacted: true

## Blockers

- KORNIX_FRONTEND_SMOKE_USERNAME/KORNIX_FRONTEND_SMOKE_PASSWORD unavailable; authenticated live frontend/backend API smoke could not be executed.

## Implementation

- currentAppliedCalculationRunId displayed run: PASS
- shortwave_radiation_daily_mj_m2 consumed: PASS
- shortwave visible/exported: PASS
- metric coverage check: PASS
- live smoke runner: PASS

## Live API smoke

- authenticated session: FAIL
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
- docker build: PASS
- git diff check: PASS

## Reports

- codex_reports/frontend_api_v2_sp37_live_report.md
- codex_reports/frontend_api_v2_sp37_live_report.json
- codex_reports/frontend_api_v2_sp37_live_smoke.json
- codex_reports/frontend_api_v2_sp37_credentials_gate.json
