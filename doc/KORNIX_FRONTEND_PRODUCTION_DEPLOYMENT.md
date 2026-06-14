# KORNIX Frontend Production Deployment

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
