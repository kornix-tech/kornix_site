# KORNIX Frontend API v2 Stitching Final Report

## Status

`KORNIX_API_V2_FRONTEND_STITCHING_READY`

## Environment

- Frontend: `http://localhost:5173`
- Backend API base: `http://localhost:8001`
- Auth: `VITE_AUTH_MODE=bff`
- Mock API: `VITE_ENABLE_MOCK_API=false`
- KORNIX API: `/api/v2/kornix/*`
- Auth endpoints: `/api/v1/*`

## Workflow Result

- `GET /api/v1/me`: PASS
- `GET /api/v2/kornix/current-context`: PASS
- `GET /api/v2/kornix/irrigation-layer/current`: PASS
- Map render with `currentAppliedCalculationRunId + methodCode`: PASS
- Profile render with `currentAppliedCalculationRunId + methodCode`: PASS
- Approval submit: PASS
- Approval polling/applied switch: PASS
- Map/profile ready after new applied run: PASS

## Implemented Fixes

- Added Docker/Vite local API proxy for same-origin `/api/*` requests while keeping `VITE_API_BASE_URL=http://localhost:8001` as the external frontend setting.
- Normalized approval `managedScope` before POST so backend-only `scopeHash` is not echoed to the strict approval DTO.
- Hydrated irrigation input from backend active projection and kept local storage only as unsaved draft cache.
- Added stale-base recovery for `BASE_CALCULATION_RUN_IS_NOT_CURRENT_APPLIED`.

## Browser Smoke Evidence

- Current applied calculation run after UI approval: `bb_user_d6794be2ac32431ea5a23532c6b0b332`
- Selected method: `simple_eto_single_layer_soil`
- Irrigation edit used: `SP:1.1`, `2026-06-03`, `4 мм`
- Final UI state: approval button returned to `approved`, no `.error-state`, URL/header switched to the new run.

## Checks

See `codex_reports/kornix_frontend_test_log.txt`.

## Blockers

None.

## Not Checked

- `npm test`: package.json has no test script.
