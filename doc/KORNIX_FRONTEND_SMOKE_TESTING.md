# KORNIX Frontend Smoke Testing

## Preconditions

- Backend API is running at `http://localhost:8001`
- Frontend is running at `http://localhost:5173`
- `.env.integration.example` is used for dev frontend

## API Smoke

- `GET http://localhost:8001/api/v1/me`
- `GET http://localhost:8001/api/v2/kornix/current-context`
- `GET http://localhost:8001/api/v2/kornix/irrigation-layer/current`
- Map endpoint with `currentAppliedCalculationRunId + methodCode`
- Profile endpoint with `currentAppliedCalculationRunId + methodCode`
- Approval submit and polling

For SP37 live API v2 proof run:

```bash
KORNIX_FRONTEND_SMOKE_API_BASE_URL=http://localhost:8001 \
KORNIX_FRONTEND_SMOKE_EXPECTED_FIELDS=37 \
KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS=13 \
KORNIX_FRONTEND_SMOKE_OUTPUT_JSON=codex_reports/frontend_api_v2_sp37_live_smoke.json \
node scripts/frontend_api_v2_sp37_live_smoke.mjs
```

If `/api/v1/me` requires authentication, provide
`KORNIX_FRONTEND_SMOKE_USERNAME` and `KORNIX_FRONTEND_SMOKE_PASSWORD` through
the environment. The smoke runner keeps cookies/CSRF tokens in memory, redacts
secrets from logs, and fails unless current-context exposes a non-empty
`currentAppliedCalculationRunId`, the map endpoint returns 37 features, and
profile-timeseries returns all 13 required metrics including
`shortwave_radiation_daily_mj_m2`.

## Browser Smoke

- Open `http://localhost:5173/map`
- Confirm network requests target `http://localhost:8001`
- Confirm selected method is `simple_eto_single_layer_soil`
- Confirm map/profile render
- Open irrigation tab and confirm active layer is visible
- Change one positive irrigation value inside managed scope
- Submit approval and wait for polling to finish
- Confirm map/profile refresh after applied calculation run

## Negative Checks

- No `/api/v1/kornix/*` requests
- No `/api/admin/v1` requests
- `0 мм` is not submitted
- Values outside `managedScope` are not editable or submitted
- Profile metric coverage does not drop `shortwave_radiation_daily_mj_m2`
