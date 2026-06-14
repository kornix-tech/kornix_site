# KORNIX Frontend API v2 Workflow

## Startup

1. `GET /api/v2/me`
2. `GET /api/v2/kornix/current-context`
3. Validate `availableMethods`
4. Select URL `methodCode` if valid, otherwise backend `defaultMethodCode`
5. Use `currentAppliedCalculationRunId` as displayed run
6. `GET /api/v2/kornix/irrigation-layer/current`
7. Load map/profile only when displayed run and method code are present

## Map And Profile

```http
GET /api/v2/kornix/field-seasons/map?calculationRunId=...&methodCode=...&day=...
GET /api/v2/kornix/water-regime/profile-timeseries?calculationRunId=...&methodCode=...&fieldSeasonIds=...&aggregation=area_weighted_mean
```

The frontend never sends the catalog placeholder as a map/profile
`calculationRunId`.

Profile-timeseries must preserve all enabled backend profile metrics declared
in `src/config/metrics.ts`. The weather chart and CSV export include
`shortwave_radiation_daily_mj_m2` (`Солнечная радиация`, `МДж/м²/сутки`), so
the backend SP37 13-metric profile response is not silently reduced to 12
metrics.

## Approval

```http
POST /api/v2/kornix/water-regime/approvals
GET  /api/v2/kornix/water-regime/approvals/{approvalBatchId}
```

The submit base is the calculation run currently displayed to the user. If the
backend returns `BASE_CALCULATION_RUN_IS_NOT_CURRENT_APPLIED`, the frontend
refetches current-context, preserves user edits, and asks the user to resubmit
with the new base.

Before submit the frontend serializes only the strict approval `managedScope`
fields: `dateFrom`, `dateTo`, `fieldSeasonIds`, `scopeVersion`. Backend-only
metadata returned by current-context, for example `scopeHash`, is not echoed to
the approval endpoint.

## No-Zero Policy

Only positive irrigation values are serialized. `0`, negative values, NaN and
empty cells are not sent as irrigation events.

## Contract Checks

Run:

```bash
npm run test:contract
```

This combines `scripts/check-frontend-contract.sh` with
`scripts/check-profile-metric-coverage.mjs`. The profile metric coverage check
fails if an enabled backend metric is not consumed/exported by
`WaterRegimeChart`, with an explicit guard for
`shortwave_radiation_daily_mj_m2`.
