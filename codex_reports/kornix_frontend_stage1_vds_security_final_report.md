# KORNIX Frontend Stage 1 VDS Security Final Report

Date: 2026-06-02

## Final Status

`KORNIX_FRONTEND_STAGE1_VDS_SECURITY_READY`

READY is claimed for the frontend-only Stage 1 VDS security scope after fresh
dependency installation, typecheck, production build, deterministic static
security/API scan, production Docker/Nginx smoke and documentation verification.

## Baseline

- Baseline commit: `8eb25652d4400edc53b359fab42c943c3fecbdbf`
- Old codebase usage: none
- Backend repository usage: none

## Checks Run

- `npm ci` through Dockerized `node:20-alpine`: passed.
- `npm run typecheck` through Dockerized `node:20-alpine`: passed.
- `npm run build` through Dockerized `node:20-alpine`: passed.
- `docker build -f Dockerfile.prod -t kornix-frontend-stage1-smoke .`: passed.
- `scripts/frontend_stage1_security_scan.sh`: passed.
- `scripts/frontend_stage1_nginx_smoke.sh 18081`: passed.
- Security docs presence and consistency check: passed.

## Checks Not Run

- `npm run lint`: not run because `package.json` has no `lint` script.
- `npm test`: not run because `package.json` has no `test` script.

Lack of lint/test scripts is recorded but is not treated as a Stage 1 blocker
because dependency install, typecheck, production build, static scans and
production static/Nginx smoke all passed.

## Verified Invariants

- Production API base is `/api`.
- Production auth mode is `bff`.
- Production mock API is disabled.
- BFF/session requests use `credentials: include`.
- Unsafe methods use CSRF from `/api/v1/auth/csrf`.
- Runtime source does not store access tokens, refresh tokens, JWTs or session
  tokens in browser storage.
- Runtime source does not call `/api/v1/kornix/*`.
- Runtime source does not call `/api/admin/v1/*`.
- Runtime source does not call stale
  `/api/v2/kornix/calculation-runs/{id}/status`.
- Calculation-run helper uses
  `/api/v2/kornix/water-regime/calculation-runs/{calculationRunId}`.
- Production Nginx uses SPA fallback with `try_files $uri $uri/ /index.html`.
- `/`, `/login` and `/map` return frontend HTML `200` in production serving mode.
- `/healthz` returns `200`.
- Missing assets under `/assets/` return `404`.
- CSP allows OpenStreetMap tile images and avoids broad script allowances.

## Remaining Blockers

None for frontend Stage 1 VDS security scope.

## Notes

The final Git commit SHA cannot be embedded into the committed report without a
self-referential amend cycle. The final Codex response reports the actual commit
SHA after commit and push.
