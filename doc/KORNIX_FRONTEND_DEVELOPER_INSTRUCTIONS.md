# KORNIX Frontend Developer Instructions

## Required Environment

```env
VITE_API_BASE_URL=/api
VITE_KORNIX_CALCULATION_TIMEOUT_MS=120000
KORNIX_DEV_API_PROXY_TARGET=http://host.docker.internal:8001
```

Restart Vite after changing any `VITE_*` value or proxy target.

## Local Run

```bash
make integration-dev
```

This starts the frontend with same-origin `/api/*` browser requests. The Vite
dev server proxies them to `KORNIX_DEV_API_PROXY_TARGET`; use
`http://localhost:8001` for a local non-Docker backend and the
`docker-compose.dev.yml` default `http://host.docker.internal:8001` inside
Docker.

## Checks

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run test:contract
npm run build
./scripts/validate.sh
```

The project currently has no `npm test` script.

## Code Documentation

- `doc/KORNIX_FRONTEND_CODE_REFERENCE.md` is the primary source-code map for
  modules, API flows, frontend calculations, storage rules and extension
  guardrails.
- `doc/KORNIX_FRONTEND_VDS_RELEASE_RUNBOOK.md` describes the pre-commit,
  pre-push and VDS deployment checklist.
- Update the code reference whenever module ownership, API flow, frontend
  calculations, browser storage or deployment-critical behavior changes.

## Guardrails

- Do not add legacy v1, mock or backend admin routes to production frontend
  runtime.
- User-facing calculation code must call only `/api/v2/*` endpoints through the
  typed API layer.
- Do not call `/api/admin/v1` or expose backend admin UI in the user frontend.
- Do not store access/refresh tokens in browser storage.
- Do not treat `localStorage` as the source of truth for approved irrigation.
- Do not send `irrigationMm=0`; empty cell means no irrigation.
- Do not edit or submit values outside backend `managedScope`.

## Reports

Final-stage reports are generated locally in `codex_reports/` for each final
readiness pass. The generated files are ignored by git; keep production commits
limited to source code, scripts, configuration, and documentation.
