# KORNIX Frontend VDS Deployment

## Target Topology

```text
Internet
  -> HTTPS reverse proxy, public 80/443
    -> /      frontend static container
    -> /api/  backend app container

Private:
  admin  SSH tunnel only, localhost:8002
  db     internal Docker network only
  worker no public ports
```

## Firewall

Open only:

- `22/tcp`
- `80/tcp`
- `443/tcp`

Do not open:

- `5432`
- `55434`
- `8000`
- `8001`
- `8002`
- `5173`

## Deploy

Before deploy, run backend backup procedure:

```bash
scripts/backup_postgres.sh
```

Deploy frontend:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  --env-file .env.production \
  up -d --build
```

## Smoke

```bash
curl -I https://<domain>/
curl -I https://<domain>/api/v2/health
```

Browser smoke:

- Login.
- Open `/fields/sp/2026`.
- Verify `/api/v2/kornix/current-context`.
- Open water regime chart.
- Edit one managed irrigation value and approve.
- Confirm URL/header switches to the new applied calculation run.

## Admin Access

Admin is not part of frontend and must not be linked from frontend. Use SSH
tunnel:

```bash
ssh -L 8002:127.0.0.1:8002 deploy@<VDS_IP>
```

Open `http://localhost:8002/admin/` locally only.

## Rollback

Rollback frontend image first. Roll back database only when backend migration is
non-compatible and restore procedure has been tested.
