# Release hardening checklist

## Security

- Production image defaults: `bff` auth, `VITE_ENABLE_MOCK_API=false`, same-origin API.
- Mock auth/API are runtime-disabled outside localhost. Private/LAN mock runtime requires explicit `VITE_ALLOW_PRIVATE_MOCK_RUNTIME=true`.
- Backend remains the authorization boundary: frontend never sends `organizationId` as a trusted tenant filter.
- `returnTo` is normalized to an allow-list of internal routes.
- API requests use `credentials: include`, `X-Requested-With`, 30s default timeout, dedicated configurable 120s calculation timeout and global `401` session expiry handling.
- Unsafe API requests bootstrap CSRF through `GET /api/v1/auth/csrf` when cookie/meta token is absent.
- Backend error envelopes are parsed into `ApiError` with `code`, `message`, `details` and `requestId`.
- Mock calculation IDs are runtime-disabled together with mock API/auth outside allowed local hosts.
- Date-dependent UI uses backend `serverDate`, `forecastStartDate` and `forecastEndDate`; calendar arithmetic must not depend on browser local timezone.
- Catalog data is used for first irrigation input only; map/profile rendering requires a real `calculationRunId`.
- User/API/KML strings injected into Leaflet HTML tooltips are escaped.
- Nginx sends CSP, frame, MIME, referrer, permissions and opener-policy headers. Production CSP allows same-origin API and explicit localhost backend origins for production-like local smoke tests.
- Dependency audit must be clean before release: `npm audit` in the Node build image.

## Performance

- Map and chart screens are lazy-loaded by route/tab.
- PNG export code is loaded only on demand.
- Vite manual chunks split React, map, chart and query vendor code.
- Static assets under `/assets/` are immutable-cacheable.

## Release verification

```bash
docker build --target prod -t kornix-frontend:release-check .
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/app" -w /app node:20-alpine sh -lc "npm ci && npm audit --audit-level=moderate && npm run build"
docker compose build
docker compose up -d
curl -I http://127.0.0.1:${KORNIX_FRONTEND_PORT:-8080}/map
```
