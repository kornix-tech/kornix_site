# KORNIX Frontend Auth Session

## Production Model

Backend owns the session and stores it in an `HttpOnly; Secure; SameSite`
cookie. Frontend sends API requests with
`credentials: include` and does not store tokens in `localStorage`,
`sessionStorage` or `IndexedDB`.

## Login Flow

1. App load calls `GET /api/v2/me`.
2. `401` means unauthenticated and routes the user to `/login`.
3. Login form posts `username/password` to `POST /api/v2/auth/login`.
4. On success frontend refetches `/api/v2/me`.
5. Protected app routes refetch current-context and API v2 data.
6. Logout sends `POST /api/v2/auth/logout`.
7. Session expiration dispatches auth-required state and returns to login.

Passwords are handled only as form values submitted to backend over HTTPS. They
are not persisted by frontend.

## CSRF

Unsafe methods `POST`, `PUT`, `PATCH`, `DELETE` request a CSRF token from
`GET /api/v2/auth/csrf` when no token is present in cookie/meta. The frontend
sends `X-CSRF-Token` and performs one safe retry if backend returns
`CSRF_TOKEN_INVALID`.

CSRF must not be disabled in production.

## Error Handling

Frontend preserves backend error envelope fields: `code`, `message`, `details`,
`requestId`. It handles `401`, `403`, `409`, `422`, `500`, `503` as API errors

## Local Dev

Local dev uses the same backend session endpoints as production. Production
builds must use:

```env
VITE_API_BASE_URL=/api
```

## Browser Storage

`localStorage` may contain only unsaved irrigation UI drafts used by
the irrigation input table. These entries are intentionally non-sensitive:
unsaved UI drafts scoped by user/organization/season. Access tokens, refresh
tokens, JWTs and session identifiers are never persisted by frontend code.
