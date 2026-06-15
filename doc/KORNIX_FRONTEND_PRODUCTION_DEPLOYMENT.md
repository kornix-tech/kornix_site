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

Supported deployment topologies:

```text
Local dev:
  browser -> Vite 5173 -> /api proxy -> host.docker.internal:8001 -> backend app

Local standalone nginx:
  browser -> frontend nginx 8080 -> /api proxy -> host.docker.internal:8001 -> backend app

VDS production:
  browser -> Caddy 80/443 -> /api -> app:8000
                         -> /    -> frontend:80
```

Do not use the standalone frontend compose as the main VDS reverse proxy. It is
only a local production-like smoke topology and expects backend API to be
published on host port `8001`. In unified VDS compose, backend `app` is exposed
inside the Docker network as `app:8000`, and Caddy owns public `/api/*` routing.

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
  --add-host=host.docker.internal:host-gateway \
  -p 127.0.0.1:18081:80 kornix-frontend-vds-smoke
sh scripts/frontend_stage1_nginx_smoke.sh 18081
npm run check:production-bundle
docker rm -f kornix-frontend-vds-smoke
```

The production smoke must prove:

- SPA routes return frontend HTML and security headers.
- `/healthz` returns `200`.
- missing `/assets/*` returns `404`.
- `/api/*` is proxied to backend JSON/API, not SPA fallback.
- production bundle does not contain `localhost:8001` or `127.0.0.1:8001`.

`nginx.conf` resolves `host.docker.internal` through the container hosts file
provided by `extra_hosts`. Do not reintroduce a variable-based `proxy_pass` for
this upstream: that makes nginx bypass `/etc/hosts` and ask Docker DNS instead.

## Documentation Gate

Any production-visible frontend change must update:

- `CHANGELOG.md`;
- `doc/KORNIX_FRONTEND_CODE_REFERENCE.md` when code ownership, data flow,
  frontend calculations or browser storage behavior changes;
- this deployment document when Docker/Nginx/env/deploy behavior changes;
- API workflow docs when `/api/v2/*` contract changes.
