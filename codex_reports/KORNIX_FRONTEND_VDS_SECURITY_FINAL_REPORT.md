# KORNIX Frontend VDS Security Final Report

## Status

`KORNIX_FRONTEND_VDS_SECURITY_READY`

## Summary

Frontend is prepared for secure VDS production deployment. Local WSL/Docker workflow is preserved, while production build uses same-origin `/api`, BFF session auth, disabled mock API, Nginx static serving and security headers.

## Security Changes

- Production API base defaults to `/api` in Docker/compose/env examples.
- Added `Dockerfile.prod` and `docker-compose.prod.yml` for static Nginx runtime without Vite dev server.
- Tightened CSP and removed localhost API origins from production Nginx config.
- Added login/password form that posts to `/api/v1/auth/login` and refetches `/api/v1/me`.
- Kept logout on `POST /api/v1/auth/logout` and CSRF on unsafe methods.
- Added one safe CSRF refresh/retry for `CSRF_TOKEN_INVALID`.
- Removed `admin` and `service_admin` roles from the user frontend type/model.
- Extended contract-check for production `/api`, security docs, no admin/legacy APIs and no auth token storage patterns.

## Checks

See `codex_reports/kornix_frontend_vds_security_test_log.txt`.

Passed:

- `npm ci --no-audit --no-fund`
- `npm run typecheck`
- `npm run build`
- `./scripts/validate.sh`
- Production Docker build
- Production Nginx security header smoke
- Browser DOM smoke for login form

Not run:

- `npm test`: package.json has no test script.

## Security Documentation

- `doc/security/KORNIX_FRONTEND_SECURITY_ARCHITECTURE.md`
- `doc/security/KORNIX_FRONTEND_AUTH_SESSION.md`
- `doc/security/KORNIX_FRONTEND_PRODUCTION_BUILD.md`
- `doc/security/KORNIX_FRONTEND_VDS_DEPLOYMENT.md`
- `doc/security/KORNIX_FRONTEND_SECURITY_TEST_PLAN.md`

## Blockers

None.
