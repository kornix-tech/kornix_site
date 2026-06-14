# KORNIX Frontend VDS Release Runbook

Практический runbook для подготовки frontend к коммиту, пушу и последующему
развёртыванию на VDS.

## Release Scope

Перед релизом убедиться, что в коммит входят только:

- `src/` frontend source;
- `public/` статические assets, если они реально используются;
- `scripts/` проверочные скрипты;
- Docker/Nginx/env templates;
- `README.md`, `CHANGELOG.md`, `doc/`, `docs/`.

Не включать:

- `.env`, `.env.production`;
- `codex_reports/`;
- `dist/`;
- `node_modules/`;
- cookies/tokens/password dumps;
- временные screenshots и clipboard-файлы.

## Pre-Commit Checklist

```bash
git status --short
git diff --check
npm run typecheck
npm run test:contract
npm audit --omit=dev --audit-level=high
```

Если build выполняется в Linux окружении:

```bash
npm run build
```

Если локальный Windows Node запускается поверх WSL `node_modules` и Vite/Rollup
падает на optional package, проверять production build через Docker:

```bash
docker build -f Dockerfile.prod -t kornix-frontend-vds-smoke .
```

## Dependency Audit

Production runtime is a static nginx image and does not copy `node_modules`.
Still, before VDS release:

```bash
npm audit --omit=dev --audit-level=high
```

must pass with zero production dependency vulnerabilities.

Full `npm audit --audit-level=high` may include build-chain/dev advisories
from Vite/esbuild. Classify those separately:

- if a non-breaking patch/minor fix exists, update dependencies before release;
- if npm suggests a breaking major upgrade, create a dedicated migration task;
- do not hide or ignore the finding in release notes.

## Production Build Contract

Production bundle должен быть собран с:

```env
VITE_API_BASE_URL=/api
VITE_KORNIX_CALCULATION_TIMEOUT_MS=120000
```

В production bundle не должно быть:

- `localhost` API base;
- mock/autonomous runtime;
- backend admin URLs;
- frontend-stored tokens.

## VDS Topology

```text
Internet
  -> HTTPS reverse proxy, public 80/443
    -> /      frontend static container
    -> /api/  backend API

Private only:
  backend app internal/local port
  backend admin via SSH tunnel
  database internal Docker network
```

Firewall:

- открыть `22/tcp`, `80/tcp`, `443/tcp`;
- не открывать `5432`, `55434`, `8000`, `8001`, `8002`, `5173`.

## Deploy Command

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  --env-file .env.production \
  up -d --build
```

Рекомендуемые VDS env values:

```env
KORNIX_FRONTEND_BIND=127.0.0.1
KORNIX_FRONTEND_PORT=8080
VITE_API_BASE_URL=/api
VITE_KORNIX_CALCULATION_TIMEOUT_MS=120000
```

Если frontend контейнер стоит за внешним reverse proxy, наружу публикуется
только reverse proxy, а frontend bind остаётся локальным.

## Post-Deploy Smoke

HTTP:

```bash
curl -I https://<domain>/
curl -I https://<domain>/login
curl -I https://<domain>/fields/sp/2026
curl -I https://<domain>/api/v2/health
```

Browser:

1. Открыть `https://<domain>/login`.
2. Войти рабочей учётной записью.
3. Проверить `/fields/sp/2026`: карта, режим `Минимальный полив`.
4. Проверить `/water-regime/sp/2026`: графики, правую панель, список полей.
5. Проверить `/irrigation-input/sp/2026`: календарь, подсказки минимального
   полива, read-only/editable режим.
6. Если backend разрешает approval, внести тестовый слой, утвердить и убедиться,
   что frontend перечитал актуальный расчёт.

Automated live smoke:

```bash
KORNIX_FRONTEND_ORIGIN=https://<domain> \
KORNIX_BACKEND_API_BASE_URL=https://<domain>/api \
KORNIX_SMOKE_ORGANIZATION_CODE=SP \
KORNIX_SMOKE_SEASON_YEAR=2026 \
node scripts/frontend_editable_approval_uat_smoke.mjs
```

## Rollback

1. Откатить frontend image/container на предыдущий tag/commit.
2. Проверить `/healthz`, `/login`, `/fields/sp/2026`.
3. Не откатывать backend DB из frontend rollback, если backend migration не
   менялась и backend остаётся совместимым.

## Operational Checks After Release

Первые 30 минут после релиза:

- нет 404 для `/assets/*`;
- `/api/*` возвращает JSON/backend errors, а не `index.html`;
- login не зацикливается;
- `current-context` возвращает expected organization/season;
- water-regime profile содержит 44 metrics;
- approval requests не уходят без CSRF;
- browser console не содержит runtime exceptions;
- VDS firewall не публикует dev/admin/database ports.

## Documentation To Keep In Sync

При изменении frontend-кода обновлять:

- `CHANGELOG.md`;
- `README.md`, если меняется запуск или public behavior;
- `doc/KORNIX_FRONTEND_CODE_REFERENCE.md`, если меняются модули, data flow,
  frontend-расчёты или storage contract;
- `doc/KORNIX_FRONTEND_PRODUCTION_DEPLOYMENT.md`, если меняется deployment;
- `doc/KORNIX_FRONTEND_API_V2_WORKFLOW.md`, если меняются API flow или DTO.
