# KORNIX Frontend Security Architecture

## Boundary

Frontend is not a security boundary. It is a static browser application served
through HTTPS and can be inspected or modified by a user. Backend/BFF is the
security boundary and must enforce session, tenant scope, authorization,
`managedScope`, CSRF and audit.

## Public And Private Surfaces

Public production surfaces:

- `https://<domain>/` -> static frontend through reverse proxy.
- `https://<domain>/api/` -> backend API through reverse proxy.

Private surfaces:

- Backend admin direct SQL console: SSH tunnel/VPN only.
- Database: internal Docker network only.
- Worker/downloader jobs: no public ports.
- Frontend container: local/internal binding, normally reached through reverse proxy.

## API Contract

Frontend uses:

- Auth/session: `/api/v1/me`, `/api/v1/auth/csrf`, `/api/v1/auth/login`, `/api/v1/auth/logout`.
- KORNIX user API: `/api/v2/kornix/*`.

Frontend must not call:

- `/api/v1/kornix/*`.
- `/api/admin/v1/*`.
- Direct database, KML, Python, downloader or admin endpoints.

## Tenant And Data Scope

Frontend never sends `organizationId` as a trusted tenant filter. Tenant and
organization are derived by backend from the server-side session. The user can
only edit field/date cells included in backend `managedScope`. Approval submit
serializes only strict scope fields: `dateFrom`, `dateTo`, `fieldSeasonIds`,
`scopeVersion`.

## Secrets

No secrets are embedded in frontend. All `VITE_*` variables are public bundle
configuration. Do not put client secrets, DB passwords, session secrets, CSRF
secrets or API keys into `VITE_*`, README, reports or screenshots.
