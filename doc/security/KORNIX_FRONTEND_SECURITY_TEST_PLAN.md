# KORNIX Frontend Security Test Plan

## Authentication

- [ ] Unauthenticated `/api/v2/kornix/current-context` returns `401` in production.
- [ ] Valid login succeeds through `POST /api/v1/auth/login`.
- [ ] Invalid login fails without creating a session.
- [ ] Logout clears server session through `POST /api/v1/auth/logout`.
- [ ] Session expiration returns the frontend to `/login`.

## Authorization And Scope

- [ ] User cannot access another organization.
- [ ] Stale `baseCalculationRunId` is rejected by backend.
- [ ] Field outside tenant is rejected by backend.
- [ ] Date outside `managedScope` is not editable and is rejected by backend.
- [ ] `irrigationMm=0` is not submitted.

## CSRF

- [ ] Approval POST without CSRF is rejected.
- [ ] Approval POST with valid CSRF is accepted.
- [ ] `CSRF_TOKEN_INVALID` triggers one token refresh and one retry.

## Network

- [ ] Only `80/443` public for web traffic.
- [ ] DB port is not public.
- [ ] Admin port is not public.
- [ ] Worker has no public port.
- [ ] Vite dev port `5173` is not public in production.

## Frontend Bundle

- [ ] Production API base is `/api`.
- [ ] No `/api/v1/kornix/*` calls.
- [ ] No `/api/admin/v1/*` calls.
- [ ] No tokens in `localStorage`, `sessionStorage`, `IndexedDB`.
- [ ] Mock mode is disabled in production.
- [ ] CSP/security headers are present.
