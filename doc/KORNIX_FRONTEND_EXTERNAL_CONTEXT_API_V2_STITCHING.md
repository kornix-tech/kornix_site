# KORNIX Frontend External Context API v2 Stitching

## Status

Frontend targets the user-facing KORNIX API v2 workflow and BFF auth.

## Runtime

- Frontend dev URL: `http://localhost:5173`
- Backend API base: `http://localhost:8001`
- Auth endpoints: `/api/v1/me`, `/api/v1/auth/csrf`, `/api/v1/auth/logout`
- KORNIX endpoints: `/api/v2/kornix/*`

## Displayed Run

The displayed calculation run is `currentContext.currentAppliedCalculationRunId`.
The frontend does not use `currentOperationalBaseCalculationRunId` as submit base
when the user is viewing a later applied run.

## Irrigation Source Of Truth

The irrigation table loads `/api/v2/kornix/irrigation-layer/current` and uses the
backend active projection as the initial state. Browser storage is only a draft
cache for unsaved user edits.

## Scope And Submission

Editable cells are limited to `currentContext.managedScope.dateFrom..dateTo` and
`managedScope.fieldSeasonIds`. Approval payloads include:

- `baseCalculationRunId`
- strict `managedScope` fields only: `dateFrom`, `dateTo`, `fieldSeasonIds`, `scopeVersion`
- `irrigationLayer` with only `irrigationMm > 0`
- `clientDiff` computed from the backend active projection

Do not echo backend-only scope metadata such as `scopeHash` to approval submit.

## Caveats

Real calculation values are backend-owned. The retired stub 1.0/2.0 criterion is
not used as current readiness evidence.
