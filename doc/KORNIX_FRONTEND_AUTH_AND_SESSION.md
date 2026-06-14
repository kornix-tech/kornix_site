# KORNIX Frontend Auth And Session

The frontend implements BFF session UX:

1. `GET /api/v2/me` on load.
2. `401` -> `/login`.
3. Login form `POST /api/v2/auth/login` with username/password.
4. Refetch `/api/v2/me` after login.
5. `POST /api/v2/auth/logout` on logout.
6. Unsafe API methods use CSRF token from `/api/v2/auth/csrf`.

No access token, refresh token, JWT or session id is stored in browser storage.
allowed local hosts.
