# KORNIX Frontend Stage 1 VDS Security Fix Report

Date: 2026-06-02

## Status

`KORNIX_FRONTEND_VDS_SECURITY_NOT_READY`

READY is not claimed because host `npm` is unavailable in the WSL shell, the
repository has no `lint`/`test` scripts to execute, and integrated backend /
reverse-proxy smoke was not run from this frontend-only workspace.

## Fixed

- Replaced stale calculation-run status runtime endpoint with
  `/api/v2/kornix/water-regime/calculation-runs/{calculationRunId}`.
- Updated README backend contract to remove the stale
  `/api/v2/kornix/calculation-runs/{calculationRunId}/status` route.
- Documented non-sensitive browser storage usage: localhost mock auth flag and
  local irrigation draft values only, not access/refresh/JWT/session tokens.
- Documented production Nginx SPA fallback with
  `try_files $uri $uri/ /index.html;`.
- Added changelog entry for the corrected calculation-run route.

## Verified

- Docker production build completed successfully with `npm ci`,
  `npm run typecheck` and `vite build` inside the Linux build container.
- Production container served `/`, `/login`, `/map` and `/healthz`.
- Runtime smoke responses included production security headers and CSP.
- Production bundle grep found no `localhost:8001`, `localhost:8002`,
  `/api/v1/kornix`, `/api/admin`, stale calculation-run status route or mock
  API marker.
- Static security grep found no auth token browser storage. Storage hits are
  limited to documented mock/dev flag and non-sensitive irrigation UI drafts.

## Not Verified

- `npm ci` / `npm run typecheck` on the WSL host shell: `npm` is not installed
  in that shell.
- `npm run lint`: package has no `lint` script.
- `npm test`: package has no `test` script.
- Integrated HTTPS reverse-proxy/backend smoke: backend and public domain were
  not available in this frontend workspace.
- Browser DevTools map-tile CSP verification: only nginx/header and bundle
  static checks were run.

## Cross-Repo Backend Dependencies

- Backend must serve public API through `/api`.
- Backend must implement BFF/session endpoints:
  `/api/v1/me`, `/api/v1/auth/csrf`, `/api/v1/auth/login`,
  `/api/v1/auth/logout`.
- Backend must implement
  `/api/v2/kornix/water-regime/calculation-runs/{calculationRunId}`.
- Reverse proxy must route `/` to frontend and `/api/` to backend without
  conflicting CSP headers.

## Old Codebase Usage

None. Work used the current `main` workspace state only.
