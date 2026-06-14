# KORNIX Frontend Production Deployment

See also:

- `doc/KORNIX_FRONTEND_CODE_REFERENCE.md` for frontend runtime/code contracts.
- `doc/KORNIX_FRONTEND_VDS_RELEASE_RUNBOOK.md` for the commit, push, deploy,
  smoke and rollback checklist.
- `doc/security/KORNIX_FRONTEND_VDS_DEPLOYMENT.md` for VDS security topology.

Use `.env.production.example` as template for `.env.production`.

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  --env-file .env.production \
  up -d --build
```

Production frontend must be built with:

```env
VITE_API_BASE_URL=/api
```

The reverse proxy routes:

- `/` to frontend static container.
- `/api/` to backend.

Do not publish frontend dev port `5173`, backend app ports, admin port or DB
port to the Internet.

## Pre-Deploy Gates

Run before commit/push:

```bash
git diff --check
npm run typecheck
npm run test:contract
npm audit --omit=dev --audit-level=high
```

Run before VDS deploy in Linux/Docker environment:

```bash
docker build -f Dockerfile.prod -t kornix-frontend-vds-smoke .
docker run --rm -d --name kornix-frontend-vds-smoke \
  -p 127.0.0.1:18081:80 kornix-frontend-vds-smoke
sh scripts/frontend_stage1_nginx_smoke.sh 18081
docker rm -f kornix-frontend-vds-smoke
```

The production smoke must prove:

- SPA routes return frontend HTML and security headers.
- `/healthz` returns `200`.
- missing `/assets/*` returns `404`.
- `/api/*` is proxied to backend JSON/API, not SPA fallback.

`nginx.conf` intentionally resolves the `/api/` upstream at request time via
Docker DNS. The frontend container must start and pass static SPA smoke even
when backend DNS is not available during nginx startup.

## Documentation Gate

Any production-visible frontend change must update:

- `CHANGELOG.md`;
- `doc/KORNIX_FRONTEND_CODE_REFERENCE.md` when code ownership, data flow,
  frontend calculations or browser storage behavior changes;
- this deployment document when Docker/Nginx/env/deploy behavior changes;
- API workflow docs when `/api/v2/*` contract changes.
