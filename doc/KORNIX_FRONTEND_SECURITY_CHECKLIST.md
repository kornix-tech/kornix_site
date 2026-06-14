# KORNIX Frontend Security Checklist

- [x] Production API base documented as `/api`.
- [x] BFF/session auth mode is production default.
- [x] Login UI posts to `/api/v2/auth/login`.
- [x] Logout posts to `/api/v2/auth/logout`.
- [x] CSRF token is sent on unsafe requests.
- [x] One CSRF refresh/retry is implemented for `CSRF_TOKEN_INVALID`.
- [x] No KORNIX legacy `/api/v1/kornix/*` calls in `src`.
- [x] No admin API calls in `src`.
- [x] `irrigationMm=0` is not serialized.
- [x] Approval submit uses backend `managedScope` and strips backend-only metadata.
- [x] Production Nginx security headers are configured.
- [x] Required `doc/security/*` frontend documentation exists.
