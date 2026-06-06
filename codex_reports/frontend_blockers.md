# Frontend Confirmation Blockers

## Current Status

`FRONTEND_BASELINE_CONFIRMED_ENV_LIMITED`

## Remaining Blockers

- WSL environment has no direct `node`/`npm`; Dockerized npm install,
  typecheck, build and Docker image build passed.
- `package.json` has no `lint` script.
- `package.json` has no `test` script.
- Full authenticated backend/browser API smoke was not run.
- Local backend `GET /api/v2/kornix/current-context` returned `200` without an
  explicit browser session. This should be reviewed in the backend/reverse-proxy
  auth-boundary pass; frontend code still uses BFF/session auth and
  `credentials: include`.

## Not Blockers

- Runtime `src` has no `/api/v1/kornix` or `/api/admin` calls.
- Runtime `src` has no access/refresh/JWT token browser storage.
- `localStorage` is used only for non-authoritative irrigation UI drafts.
- `sessionStorage` is used only for local mock-auth flag.
- KML text is static fixture provenance, not runtime source of truth.
