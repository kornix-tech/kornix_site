# KORNIX Frontend API v2 SP37 Live Report

## Status

`NOT_READY_FRONTEND_API_V2_SP37_GAP`

Frontend implementation was updated so the SP37 profile metric
`shortwave_radiation_daily_mj_m2` is consumed by `WaterRegimeChart`, rendered in
the weather chart and exported to CSV. A dependency-free metric coverage check
and a live API v2 SP37 smoke runner were added.

READY is not claimed because authenticated live backend smoke could not run:
`/api/v1/me` returned `401`, and `KORNIX_FRONTEND_SMOKE_USERNAME` /
`KORNIX_FRONTEND_SMOKE_PASSWORD` were not available in the environment.

## Implementation

- Displayed run source remains `currentAppliedCalculationRunId`.
- Legacy `/api/v1/kornix` runtime endpoints remain absent.
- Admin runtime endpoints remain absent.
- Mock API is not used for the live-smoke proof.
- `shortwave_radiation_daily_mj_m2` is read from profile-timeseries.
- Shortwave radiation is visible in the weather chart with unit
  `МДж/м²/сутки`.
- Shortwave radiation is exported in profile CSV.
- `npm run test:contract` verifies profile metric coverage: 13/13.

## Live Smoke

Live smoke output:

- `codex_reports/frontend_api_v2_sp37_live_smoke.json`
- `codex_reports/frontend_api_v2_sp37_live_smoke_log.txt`

Result:

- authenticated session: FAIL
- current-context: NOT_RUN after auth blocker
- map features: NOT_RUN
- profile metrics: NOT_RUN
- shortwave backend presence: NOT_RUN

Blocker:

```text
KORNIX_FRONTEND_SMOKE_USERNAME/KORNIX_FRONTEND_SMOKE_PASSWORD unavailable; authenticated live frontend/backend API smoke could not be executed.
```

## Checks

- npm ci: PASS via Dockerized Node 20.
- typecheck: PASS via Dockerized Node 20.
- build: PASS via Dockerized Node 20.
- contract test: PASS.
- contract scan: PASS.
- security scan: PASS.
- Docker production build: PASS.
- Nginx/static smoke: PASS.
- git diff check: PASS.

## Reports

- `codex_reports/frontend_api_v2_sp37_contract_map.json`
- `codex_reports/frontend_api_v2_sp37_live_smoke.json`
- `codex_reports/frontend_api_v2_sp37_npm_ci_log.txt`
- `codex_reports/frontend_api_v2_sp37_typecheck_log.txt`
- `codex_reports/frontend_api_v2_sp37_build_log.txt`
- `codex_reports/frontend_api_v2_sp37_contract_test_log.txt`
- `codex_reports/frontend_api_v2_sp37_contract_scan_log.txt`
- `codex_reports/frontend_api_v2_sp37_security_scan_log.txt`
- `codex_reports/frontend_api_v2_sp37_docker_build_log.txt`
- `codex_reports/frontend_api_v2_sp37_nginx_smoke_log.txt`

## Final Status

`NOT_READY_FRONTEND_API_V2_SP37_GAP`
