# KORNIX Frontend Production Build

## Build

Production build uses `Dockerfile.prod` or the `prod` target in `Dockerfile`:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  --env-file .env.production \
  up -d --build
```

The build stage runs `npm ci` and `npm run build`. The runtime stage is Nginx
serving static `dist`. Vite dev server is not used in production.

## Required Production Env

```env
VITE_AUTH_MODE=bff
VITE_ENABLE_MOCK_API=false
VITE_ALLOW_PRIVATE_MOCK_RUNTIME=false
VITE_API_BASE_URL=/api
VITE_KORNIX_API_VERSION=v2
VITE_KORNIX_CALCULATION_TIMEOUT_MS=120000
```

`VITE_API_BASE_URL=/api` is intentionally same-origin. The public reverse proxy
routes `/api/` to backend and `/` to frontend.

## Headers

`nginx.conf` sets production security headers:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Frame-Options`
- `Cross-Origin-Opener-Policy`

CSP does not allow arbitrary scripts. `style-src 'unsafe-inline'` is kept
because map/chart libraries and React UI use inline style attributes for
positioning and dimensions; this must be revisited if the UI is refactored.

## Prohibited Build Inputs

Do not set production frontend to:

- `VITE_AUTH_MODE=mock`
- `VITE_ENABLE_MOCK_API=true`
- `VITE_API_BASE_URL=http://localhost:*`
- any secret in `VITE_*`
