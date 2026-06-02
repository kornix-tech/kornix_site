# KORNIX Frontend Developer Instructions

## Required Environment

```env
VITE_API_BASE_URL=http://localhost:8001
VITE_AUTH_MODE=bff
VITE_ENABLE_MOCK_API=false
VITE_KORNIX_API_VERSION=v2
VITE_KORNIX_CALCULATION_TIMEOUT_MS=120000
```

Restart Vite after changing any `VITE_*` value.

## Local Run

```bash
make integration-dev
```

This starts the frontend against the local backend API on port `8001`.
Inside Docker the Vite dev server proxies same-origin `/api/*` requests to
`KORNIX_DEV_API_PROXY_TARGET`, which defaults to
`http://host.docker.internal:8001`. Keep `VITE_API_BASE_URL` set to
`http://localhost:8001`; the proxy target is only the container-to-host route.

## Checks

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run build
./scripts/validate.sh
```

The project currently has no `npm test` script.

## Guardrails

- Do not call `/api/v1/kornix/*` from production frontend code.
- Do not call `/api/admin/v1` or expose backend admin UI in the user frontend.
- Do not store access/refresh tokens in browser storage.
- Do not treat `localStorage` as the source of truth for approved irrigation.
- Do not send `irrigationMm=0`; empty cell means no irrigation.
- Do not edit or submit values outside backend `managedScope`.

## Reports

Final-stage reports live in `codex_reports/` and are regenerated for each final
readiness pass.
