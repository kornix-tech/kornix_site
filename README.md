# KORNIX Frontend Container Scaffold

Минимальный frontend-scaffold для KORNIX:

- React + TypeScript + Vite;
- Leaflet для карты полей;
- Recharts для графиков водного режима;
- Docker multi-stage build;
- Nginx production web server;
- dev-режим через Vite внутри Docker;
- mock API для автономной разработки без backend;
- короткие URL `/map`, `/water-regime` и `/irrigation` с query-state только для выбранных полей, дат и дня карты.

## Быстрый запуск в WSL

```bash
cd kornix-frontend
cp .env.example .env
docker compose build
docker compose up -d
```

Открыть из Windows:

```text
http://localhost:8080
```

Открыть из WSL:

```bash
curl -I http://127.0.0.1:8080
```

## Dev-режим с hot reload

```bash
cd kornix-frontend
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

Открыть из Windows:

```text
http://localhost:5173
```

## Run frontend against local backend API

Для smoke-проверки с локальным backend API используйте `.env.integration.example`.
Этот профиль запускает frontend в BFF-режиме, отключает mock API и направляет
запросы на `http://localhost:8001`. Auth endpoints остаются на `/api/v1`,
пользовательский KORNIX calculation API работает через `/api/v2/kornix`:

```bash
make integration-dev
```

После изменения любых `VITE_*` переменных перезапускайте Vite dev server:
эти значения читаются на старте dev server или встраиваются на этапе build.
Mock-режим не использовать для backend smoke; tenant scope определяет backend
через session endpoints.

В Docker dev-режиме браузер ходит в same-origin `/api/*`, а Vite проксирует
эти запросы к backend. Это сохраняет внешний frontend env
`VITE_API_BASE_URL=http://localhost:8001` и убирает зависимость от CORS на
локальном backend. При необходимости внутреннюю цель proxy можно переопределить
через `KORNIX_DEV_API_PROXY_TARGET`.

## Production-like режим

`docker-compose.yml` собирает статический frontend и запускает Nginx внутри контейнера. Это ближе к будущему VDS-развертыванию, чем Vite dev server.

```bash
docker compose up -d --build
```

Для production/VDS используйте `.env.production.example` как шаблон:

```env
VITE_AUTH_MODE=bff
VITE_ENABLE_MOCK_API=false
VITE_API_BASE_URL=/api
```

Production build не должен содержать `localhost` как API base. Публичный
reverse proxy обслуживает `https://<domain>/` как frontend и
`https://<domain>/api/` как backend API.

Production static smoke для Stage 1:

```bash
docker build -f Dockerfile.prod -t kornix-frontend-stage1-smoke .
docker run --rm -d --name kornix-frontend-stage1-smoke \
  -p 127.0.0.1:18081:80 kornix-frontend-stage1-smoke
sh scripts/frontend_stage1_nginx_smoke.sh 18081
docker rm -f kornix-frontend-stage1-smoke
```

Ожидаемо: `/`, `/login` и `/map` возвращают frontend HTML `200`,
`/healthz` возвращает `200`, отсутствующий asset под `/assets/` возвращает
`404`, а ответы frontend routes содержат production security headers и CSP.

## Перенос на VDS

На VDS frontend-контейнер не должен быть единственной публичной границей.
Рекомендуемая схема: публичны только `80/443` reverse proxy, frontend доступен
локально/внутри Docker, backend API опубликован через `/api`, admin и DB не
публикуются наружу.

Команда production deployment:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  --env-file .env.production \
  up -d --build
```

Для production с внешним reverse proxy оставьте контейнер на локальном порту:

```env
KORNIX_FRONTEND_BIND=127.0.0.1
KORNIX_FRONTEND_PORT=8080
```

Firewall VDS: открыть только `22/tcp`, `80/tcp`, `443/tcp`. Не открывать
`5432`, `55434`, `8000`, `8001`, `8002`, `5173`.

## Security model

Frontend не является security boundary. Он не хранит секреты, не хранит
access/refresh token/JWT/session id в `localStorage`, `sessionStorage` или
`IndexedDB`, не принимает `organizationId` как доверенный tenant filter и не
экспонирует backend admin routes.

Security boundary находится на backend/BFF: tenant scope, session, права
доступа, `managedScope`, stale-base checks, CSRF и audit должны проверяться
сервером. Даже при компрометации browser bundle backend обязан отклонять чужие
`fieldSeasonIds`, даты вне scope, `irrigationMm=0`, устаревший
`baseCalculationRunId` и запросы без CSRF.

## Production API base

Production frontend собирается с:

```env
VITE_API_BASE_URL=/api
VITE_AUTH_MODE=bff
VITE_ENABLE_MOCK_API=false
```

`/api/v1/*` используется только для auth/session/CSRF. Пользовательский KORNIX
API работает только через `/api/v2/kornix/*`. Legacy `/api/v1/kornix/*` и
`/api/admin/v1/*` запрещены для пользовательского frontend.

## Mock API

Для локальной разработки в `.env.example` включён mock API:

```env
VITE_AUTH_MODE=mock
VITE_ENABLE_MOCK_API=true
VITE_ALLOW_PRIVATE_MOCK_RUNTIME=false
VITE_API_BASE_URL=http://localhost:8001
```

Для подключения реального backend:

```env
VITE_AUTH_MODE=bff
VITE_ENABLE_MOCK_API=false
VITE_ALLOW_PRIVATE_MOCK_RUNTIME=false
VITE_API_BASE_URL=http://localhost:8001
```

Frontend ожидает, что backend сам определяет organization/farm scope по авторизации. Клиент не должен передавать `organizationId` как trust-фильтр.
Production Docker defaults безопасны по умолчанию: `bff` auth и `VITE_ENABLE_MOCK_API=false`.
Даже если mock-сборку случайно открыть вне `localhost`, mock auth/API
отключаются runtime-защитой. Доступ к mock-режиму с private/LAN hostname
разрешается только явным флагом `VITE_ALLOW_PRIVATE_MOCK_RUNTIME=true`.

## Auth modes

Frontend подготовлен к двум режимам авторизации:

```text
mock - локальный demo-вход без backend;
bff  - будущий Backend-for-Frontend/session backend с внешним OIDC provider.
```

В mock mode кнопка входа создаёт только dev-флаг mock-сессии. Токены, JWT,
refresh token, access token и session id не сохраняются в `localStorage` или
`sessionStorage`.

В bff mode frontend:

1. вызывает `GET /api/v1/me`;
2. при `401` показывает `/login`;
3. форма входа отправляет `POST /api/v1/auth/login` с `username/password`;
4. после успеха перечитывает `/api/v1/me` и возвращает пользователя на исходный URL;
5. выполняет реальные API-запросы с `credentials: include`;
6. при `401`, `403`, CSRF errors или session expired показывает понятное состояние входа/ошибки без fallback в mock.

Backend должен реализовать:

```http
GET  /api/v1/me
GET  /api/v1/auth/csrf
POST /api/v1/auth/login
POST /api/v1/auth/logout

GET  /api/v2/kornix/current-context
GET  /api/v2/kornix/field-seasons/catalog?seasonYear=2026
GET  /api/v2/kornix/methods
GET  /api/v2/kornix/readiness/current
GET  /api/v2/kornix/irrigation-layer/current
POST /api/v2/kornix/water-regime/approvals
GET  /api/v2/kornix/water-regime/approvals/{approvalBatchId}
GET  /api/v2/kornix/water-regime/calculation-runs/{calculationRunId}
GET  /api/v2/kornix/field-seasons/map?calculationRunId=...&methodCode=...&day=YYYY-MM-DD
GET  /api/v2/kornix/water-regime/profile-timeseries?calculationRunId=...&methodCode=...&fieldSeasonIds=...&aggregation=area_weighted_mean
```

`current-context` должен отдавать календарные даты backend в московской зоне,
`managedScope`, `frontendMode`, `submitAllowed`, `availableMethods`,
`defaultMethodCode` и `currentAppliedCalculationRunId`. Именно
`currentAppliedCalculationRunId` является отображаемым расчётом. Если его нет,
frontend показывает каталог/состояние готовности и не вызывает map/profile.
Активная проекция поливов загружается из `irrigation-layer/current` и является
исходным состоянием таблицы. Локальное хранилище используется только как draft
несохранённых правок. Утверждение поливов отправляет только положительные
непустые значения в `irrigationLayer`; `0 мм` и пустые ячейки не
сериализуются. Editable-ячейки ограничены backend-issued `managedScope`.
Для `POST`, `PUT`, `PATCH`, `DELETE` frontend перед запросом получает CSRF token
через `/api/v1/auth/csrf`, если token ещё не пришёл в cookie или meta. При
`CSRF_TOKEN_INVALID` unsafe-запрос повторно получает CSRF token и делает один
безопасный повтор запроса.

Проверка frontend API v2/SP37 live-smoke:

```bash
KORNIX_FRONTEND_SMOKE_API_BASE_URL=http://localhost:8001 \
KORNIX_FRONTEND_SMOKE_EXPECTED_FIELDS=37 \
KORNIX_FRONTEND_SMOKE_EXPECTED_METRICS=13 \
node scripts/frontend_api_v2_sp37_live_smoke.mjs
```

Если `/api/v1/me` требует авторизацию, задайте
`KORNIX_FRONTEND_SMOKE_USERNAME` и `KORNIX_FRONTEND_SMOKE_PASSWORD` в окружении.
Скрипт не печатает cookies, CSRF token или пароль и сохраняет JSON-результат в
`codex_reports/frontend_api_v2_sp37_live_smoke.json`.

Покрытие profile metrics проверяется командой:

```bash
npm run test:contract
```

Она блокирует регресс, при котором backend metric
`shortwave_radiation_daily_mj_m2` перестаёт попадать в график или CSV export.

Проверка `/api/v1/me` для будущего backend:

```bash
curl -i -H 'Accept: application/json' https://api.example.com/api/v1/me
```

Важно: `VITE_*` переменные встраиваются Vite на этапе build. После изменения
`VITE_AUTH_MODE`, `VITE_ENABLE_MOCK_API` или `VITE_API_BASE_URL` production image
нужно пересобрать:

```bash
docker compose up -d --build
```

Не добавлять `client secret` в `VITE_*`: такие переменные попадают в browser
bundle. Production-направление для KORNIX — OIDC Authorization Code Flow with
PKCE через backend/BFF, server-side session и `HttpOnly; Secure; SameSite`
cookie.

## API checklist

Актуальный пользовательский frontend переведён на Big Bang контракт
`/api/v2/kornix`: tenant scope задаёт BFF/backend, frontend не передаёт
`organizationCode` как доверенный фильтр, использует backend-даты, выбранный
`methodCode`, `managedScope`, approval workflow с polling и правило `null != 0`.

Backend error envelope должен иметь форму
`{ "error": { "code", "message", "details", "requestId" } }`; frontend
показывает `code/message` и сохраняет `requestId` в `ApiError`.

Актуальная документация текущего API v2 stitching этапа:

- [`doc/KORNIX_FRONTEND_EXTERNAL_CONTEXT_API_V2_STITCHING.md`](doc/KORNIX_FRONTEND_EXTERNAL_CONTEXT_API_V2_STITCHING.md)
- [`doc/KORNIX_FRONTEND_DEVELOPER_INSTRUCTIONS.md`](doc/KORNIX_FRONTEND_DEVELOPER_INSTRUCTIONS.md)
- [`doc/KORNIX_FRONTEND_API_V2_WORKFLOW.md`](doc/KORNIX_FRONTEND_API_V2_WORKFLOW.md)
- [`doc/KORNIX_FRONTEND_SMOKE_TESTING.md`](doc/KORNIX_FRONTEND_SMOKE_TESTING.md)

Security documentation index:

- [`doc/security/KORNIX_FRONTEND_SECURITY_ARCHITECTURE.md`](doc/security/KORNIX_FRONTEND_SECURITY_ARCHITECTURE.md)
- [`doc/security/KORNIX_FRONTEND_AUTH_SESSION.md`](doc/security/KORNIX_FRONTEND_AUTH_SESSION.md)
- [`doc/security/KORNIX_FRONTEND_PRODUCTION_BUILD.md`](doc/security/KORNIX_FRONTEND_PRODUCTION_BUILD.md)
- [`doc/security/KORNIX_FRONTEND_VDS_DEPLOYMENT.md`](doc/security/KORNIX_FRONTEND_VDS_DEPLOYMENT.md)
- [`doc/security/KORNIX_FRONTEND_SECURITY_TEST_PLAN.md`](doc/security/KORNIX_FRONTEND_SECURITY_TEST_PLAN.md)

Финальные машинно-проверяемые отчёты текущего этапа находятся в
[`codex_reports/`](codex_reports/).

## Current baseline status

Свежий baseline-аудит фиксируется в `codex_reports/` и должен читаться вместе с
security-документацией выше. На 2026-06-06 frontend подтверждён как
React/Vite SPA, работающий через backend HTTP API: auth/session endpoints
остаются на `/api/v1`, пользовательский KORNIX contour работает через
`/api/v2/kornix`, production API base — `/api`. Runtime-код не должен читать
PostgreSQL/PostGIS, KML или Python-модули напрямую и не должен хранить
access/refresh tokens в browser storage.

Основные файлы текущего baseline-аудита:

- [`codex_reports/frontend_baseline_audit_report.md`](codex_reports/frontend_baseline_audit_report.md)
- [`codex_reports/frontend_baseline_audit_report.json`](codex_reports/frontend_baseline_audit_report.json)
- [`codex_reports/frontend_smoke_summary.json`](codex_reports/frontend_smoke_summary.json)
- [`codex_reports/frontend_security_documentation_matrix.json`](codex_reports/frontend_security_documentation_matrix.json)

Исторические требования к KORNIX system API сохранены в
[`docs/kornix-system-api-requirements-v0.2.md`](docs/kornix-system-api-requirements-v0.2.md).

Исторический frontend-driven чек-лист v0.1 сохранен здесь:
[`docs/kornix-frontend-api-checklist-v0.1.md`](docs/kornix-frontend-api-checklist-v0.1.md).

## Основные команды

```bash
# production-like container
make build
make up
make logs
make down

# dev container
make dev

# локальная проверка внутри одноразового node-контейнера
make validate
```

## Важные ограничения scaffold

1. Авторизация подготовлена через `AuthClient` abstraction: `mock` mode работает только для локальной разработки, `bff` mode является production-default и ждёт backend session endpoints.
2. Агрегация в mock API считается в браузерном/Node-слое только для разработки. В production агрегацию должен считать backend.
3. Основной идентификатор выбора — `fieldSeasonId`, а не `fieldId`.
4. `NULL` и пропуски данных отображаются как отсутствие данных, а не как нули.
5. Фактический полив и рекомендованный полив разделены семантически.
