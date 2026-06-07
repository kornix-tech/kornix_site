# Frontend API v2 SP37 live report

Status: **NOT_READY_FRONTEND_API_V2_SP37_GAP**

Target status: KORNIX_FRONTEND_API_V2_SP37_LIVE_READY

Generated at: 2026-06-07T20:50:00.000Z

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

## Checks

- npm ci: PASS
- typecheck: PASS
- build: PASS
- contract test: PASS
- contract scan: PASS
- security scan: PASS
- docker build: PASS
- nginx/static smoke: PASS
- git diff check: PASS

## Reports

- codex_reports/frontend_api_v2_sp37_live_report.md
- codex_reports/frontend_api_v2_sp37_live_report.json
- codex_reports/frontend_api_v2_sp37_contract_map.json
- codex_reports/frontend_api_v2_sp37_live_smoke.json
