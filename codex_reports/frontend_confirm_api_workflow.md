# Frontend API Workflow Confirmation

## Summary

Current frontend runtime code remains aligned with the `/api/v1` BFF/session
and `/api/v2/kornix` user API contour. No production runtime call to
`/api/v1/kornix` or `/api/admin/*` was found.

## Workflow

1. Session check: `BffSessionAuthClient` reads the current user through
   `GET /api/v1/me`.
2. Current context: `WorkspacePage` fetches
   `GET /api/v2/kornix/current-context` with React Query.
3. Irrigation layer: `IrrigationInputTable` fetches
   `GET /api/v2/kornix/irrigation-layer/current` and uses backend projection as
   the authoritative initial table state.
4. Displayed run: `WorkspacePage` uses `currentAppliedCalculationRunId`,
   filters reserved `catalog`, and passes the active run into map/profile and
   irrigation approval flow.
5. Map/profile: map requests
   `GET /api/v2/kornix/field-seasons/map`; chart requests
   `GET /api/v2/kornix/water-regime/profile-timeseries`.
6. Approval submit: `IrrigationInputTable` posts
   `POST /api/v2/kornix/water-regime/approvals` with strict `managedScope`,
   positive `irrigationLayer`, `baseCalculationRunId` and `clientDiff`.
7. CSRF: `requestJson` fetches `/api/v1/auth/csrf` for unsafe methods, sends
   `X-CSRF-Token`, and retries once on `CSRF_TOKEN_INVALID`.
8. Polling: if `pollRequired` is true, frontend polls
   `GET /api/v2/kornix/water-regime/approvals/{approvalBatchId}` until a final
   status.
9. Refetch after apply: on applied/completed status, frontend refetches current
   context and active irrigation layer; backend projection replaces local draft
   state.

## Result

- currentContext: PASS
- irrigationLayer: PASS
- approvalPost: PASS
- polling: PASS
- refetchAfterApply: PASS

## Limitation

Full destructive approval smoke was not run. Confirmation is based on static
runtime code inspection and safe backend GET smoke only.
