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

## Production-like режим

`docker-compose.yml` собирает статический frontend и запускает Nginx внутри контейнера. Это ближе к будущему VDS-развертыванию, чем Vite dev server.

```bash
docker compose up -d --build
```

## Перенос на VDS

На VDS можно использовать тот же каталог и тот же `docker-compose.yml`. Для публичного доступа поменять bind-address в `.env`:

```env
KORNIX_FRONTEND_BIND=0.0.0.0
KORNIX_FRONTEND_PORT=80
```

Для production с внешним reverse proxy обычно лучше оставить контейнер на локальном порту, например `127.0.0.1:8080`, и проксировать через системный Nginx/Caddy/Traefik.

## Mock API

Для локальной разработки в `.env.example` включён mock API:

```env
VITE_AUTH_MODE=mock
VITE_ENABLE_MOCK_API=true
VITE_ALLOW_PRIVATE_MOCK_RUNTIME=false
VITE_API_BASE_URL=http://localhost:8000
```

Для подключения реального backend:

```env
VITE_AUTH_MODE=bff
VITE_ENABLE_MOCK_API=false
VITE_ALLOW_PRIVATE_MOCK_RUNTIME=false
VITE_API_BASE_URL=https://api.example.com
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
3. по кнопке входа перенаправляет на
   `/api/v1/auth/login?returnTo=<current-url>`;
4. выполняет реальные API-запросы с `credentials: include`.

Backend должен реализовать:

```http
GET  /api/v1/me
GET  /api/v1/auth/login?returnTo=/map
POST /api/v1/auth/logout
GET  /api/v1/kornix/current-context
POST /api/v1/kornix/water-regime/calculate
GET  /api/v1/kornix/field-seasons/map?calculationRunId=...&day=YYYY-MM-DD
GET  /api/v1/kornix/water-regime/profile-timeseries?calculationRunId=...&fieldSeasonIds=...&aggregation=area_weighted_mean
```

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

Актуальный frontend-контракт API v1.0 находится в
[`docs/kornix-frontend-api-v1.md`](docs/kornix-frontend-api-v1.md).
Он фиксирует tenant-scoped BFF workflow, групповой `calculationRunId`, отправку
только `irrigation_tasks`, v1.0 `long_name_for_code`, правило `null != 0` и
разделение рекомендаций от задач полива.

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
