# KORNIX Frontend Code Reference

Документ описывает production frontend-код, его границы ответственности,
ключевые модули, frontend-расчёты и проверки перед VDS-развёртыванием.
Он предназначен для сопровождения кода после коммита, ревью и переноса на VDS.

## Production Boundaries

Frontend является пользовательским SPA и не является security boundary.
Все права доступа, tenant scope, session, CSRF, stale-base checks,
`managedScope` и audit проверяются backend.

Frontend обязан:

- работать только через `/api/v2/*`;
- не хранить JWT/access/refresh token/session id в browser storage;
- не доверять `organizationCode` из URL как фильтру доступа;
- не обращаться к backend admin routes;
- не иметь mock/autonomous fallback в production runtime;
- сериализовать в approval только положительные значения поливов;
- не отправлять поля вне backend-issued `managedScope`.

## Runtime Entry Points

### `src/main.tsx`

Точка входа React-приложения. Создаёт `QueryClient`, подключает
`BrowserRouter`, `AuthProvider` и рендерит `App`.

Production-инварианты:

- React Query используется как runtime cache API-ответов.
- Состояние авторизации находится в `AuthProvider`, а не в localStorage.

### `src/App.tsx`

Описывает публичные frontend routes:

- `/login`;
- `/fields/:organizationCode/:seasonYear`;
- `/water-regime/:organizationCode/:seasonYear`;
- `/irrigation-input/:organizationCode/:seasonYear`;
- legacy routes `/map`, `/water-regime`, `/irrigation`, `/workspace`;
- fallback на нейтральный `/workspace`.

Friendly routes являются canonical URL для VDS. Технические параметры
экрана остаются в query string только там, где они нужны для восстановления
состояния: выбранные поля, даты, день карты, метод.

## API Layer

### `src/shared/api/httpClient.ts`

Единый низкоуровневый HTTP-клиент.

Ответственность:

- строит URL с учётом `VITE_API_BASE_URL`;
- в dev-интеграции отправляет local backend requests same-origin через Vite
  proxy, если backend на `localhost` и другой origin;
- всегда отправляет `credentials: include`;
- выставляет `Accept: application/json` и `X-Requested-With`;
- перед unsafe-запросами получает CSRF token через `/api/v2/auth/csrf`;
- делает один безопасный retry при backend code `CSRF_TOKEN_INVALID`;
- транслирует `401` в событие `kornix:auth-required`;
- нормализует backend error envelope в `ApiError`;
- поддерживает per-request timeout.

Критичные ограничения:

- не добавлять storage token flow;
- не обходить `requestJson` прямыми `fetch` для user API;
- не подавлять `ApiError` без понятного пользовательского состояния.

### `src/api/kornixApi.ts`

Typed API facade поверх `requestJson`.

Основные endpoints:

- `GET /api/v2/me`;
- `GET /api/v2/kornix/current-context`;
- `GET /api/v2/kornix/methods`;
- `GET /api/v2/kornix/readiness/current`;
- `GET /api/v2/kornix/field-seasons/catalog`;
- `GET /api/v2/kornix/field-seasons/map`;
- `GET /api/v2/kornix/water-regime/profile-timeseries`;
- `GET /api/v2/kornix/irrigation-layer/current`;
- `POST /api/v2/kornix/water-regime/approvals`;
- `GET /api/v2/kornix/water-regime/approvals/{approvalBatchId}`;
- `GET /api/v2/kornix/water-regime/calculation-runs/{calculationRunId}`.

Нормализация:

- legacy/camelCase recommendation поля приводятся к текущим snake_case DTO;
- map feature без geometry получает пустой `MultiPolygon`, чтобы UI не падал;
- отсутствующие `features`, `metrics`, `warnings`, `recommendations` заменяются
  безопасными пустыми значениями;
- legacy method fields `displayName`/`methodVersion` приводятся к
  `label`/`version`;
- catalog может быть представлен как temporary `FeatureCollection` только для
  отображения полей до первого расчёта; `calculationRunId='catalog'` нельзя
  отправлять в map/profile runtime.

Production-инвариант: пользовательский frontend не должен добавлять старые v1
или admin endpoints.

### `src/types/kornix.ts`

Основной DTO contract frontend/backend.

Особенно важные группы:

- auth/current user;
- current context, managed scope, frontend mode;
- field catalog/map feature properties;
- profile timeseries metrics;
- irrigation approval request/response/status;
- calculation run status;
- required FAO90 metric codes.

Любое изменение backend DTO должно сначала попасть сюда, затем в API facade,
затем в конкретные UI-компоненты.

## Auth And Session

### `src/features/auth/AuthProvider.tsx`

Хранит состояние авторизации:

- `loading`;
- `anonymous`;
- `authenticated`;
- `error`.

При старте вызывает `GET /api/v2/me`. При событии `kornix:auth-required`
переводит пользователя в anonymous state. Login вызывает backend session login,
затем перечитывает `/api/v2/me`.

### `src/features/auth/bffSessionAuthClient.ts`

Session client для BFF/backend cookie flow.

Методы:

- `getCurrentUser`;
- `login`;
- `logout`.

Критично: клиент не хранит токены и не принимает frontend-issued tenant scope.

### `src/features/auth/LoginPage.tsx`

Форма входа. Использует `returnTo`, нормализованный в `returnTo.ts`.
После успешного входа возвращает пользователя на разрешённый path.

### `src/features/auth/returnTo.ts`

Разрешает только безопасные local paths:

- canonical friendly workspace paths;
- legacy local workspace paths.

Внешние URL и произвольные paths не используются как redirect target.

## Workspace State And Routing

### `src/workspace/workspaceUrlState.ts`

Парсит и сериализует состояние рабочего пространства.

Canonical paths:

- `/fields/{organizationCode}/{seasonYear}` -> карта;
- `/water-regime/{organizationCode}/{seasonYear}` -> график;
- `/irrigation-input/{organizationCode}/{seasonYear}` -> ввод поливов.

Query state:

- `methodCode`;
- `day` только для карты;
- `fields`, включая `fields=none` для явного пустого выбора в графике;
- `from`/`to` для графика.

Защиты:

- лимит field ids в URL;
- whitelist формата field/calc ids;
- запрет reserved calculation run `catalog`;
- проверка ISO dates;
- нормализация organization code.

### `src/workspace/WorkspacePage.tsx`

Главный orchestrator пользовательского рабочего места.

Ответственность:

- читает URL state и синхронизирует его с browser history;
- загружает current context, methods, readiness, catalog/map;
- выбирает displayed calculation run из backend `currentAppliedCalculationRunId`;
- управляет вкладками карты, графика и ввода поливов;
- хранит frontend preferences: диапазон регулирования и режим карты;
- передаёт shared field list, moisture zones и forecast zones в дочерние
  компоненты;
- очищает session UI preferences на logout;
- оставляет export/method components в React tree, но CSS может скрывать их
  без удаления кода.

Production-инварианты:

- если displayed calculation run отсутствует, map/profile не вызываются;
- URL `calculationRunId` не должен становиться источником истины против backend;
- редактирование поливов доступно только при backend `current_editable` и
  `submitAllowed=true`.

## Shared Field List

### `src/workspace/FieldSelectorPanel.tsx`

Единый компонент левой плашки `Поля` для `Водный режим` и `Ввод поливов`.

Функции:

- сортировка полей по числовым частям ключа;
- удаление tenant prefix из номера поля;
- форматирование культуры и сорта;
- поиск по field name, field key, display key, культуре и сорту;
- выбор/снятие всех видимых полей;
- фон карточки по текущей frontend-зоне влагозапасов;
- круглый forecast indicator по зоне на конец прогноза;
- hover-подсказки: `Влажно`, `Сухо`, `Нужен полив`,
  `Влагозапасы в норме`.

Правило сопровождения: не дублировать левую плашку в других экранах. Если
нужен список полей, использовать этот компонент или расширять его API.

## Map Screen

### `src/workspace/FieldMap.tsx`

Leaflet-карта полей.

Режимы отображения:

- `minimum_irrigation` - минимальный полив до нижней границы регулирования;
- `status` - уровень влагозапасов;
- `water_percent` - процент продуктивных влагозапасов;
- `field_capacity_percent` - влагозапасы в процентах от НВ;
- `temperature_sum` - сумма температур от даты сева.

Frontend-расчёты:

- `minimum_irrigation = max(0, fieldCapacity * regulationRange.min - water)`;
- `fieldCapacityPercent = water / fieldCapacity * 100`;
- productive water percent берётся из `deriveWaterMetrics`;
- статусные цвета берутся из frontend-зон влагозапасов, а не только из
  backend `latestStatus`.

Tooltip получает dynamic summary, соответствующий выбранному режиму карты.

### `src/workspace/MapDisplayPanel.tsx`

Правая панель карты:

- список режимов отображения;
- легенда выбранного режима;
- пользовательские warnings после фильтрации служебных warning codes;
- slot для method/export components.

Состояние выбранного режима карты хранится в session storage до logout.

### `src/workspace/MapTimeRuler.tsx`

Нижняя линейка времени карты. Позволяет выбрать день в диапазоне расчёта и
прогноза.

## Field Tooltip

### `src/workspace/FieldTooltip.tsx`

Формирует HTML tooltip для Leaflet.

Содержит:

- compact title поля;
- текущие показатели влагозапасов;
- влажность корнеобитаемого слоя в процентах НВ;
- полив до нижней/верхней границы регулирования;
- прогноз `today+7`;
- недельный дефицит как ET minus precipitation;
- рекомендованный полив по прогнозному влагозапасу;
- data quality messages, если backend их вернул.

Все выводимые строки проходят `escapeHtml`.

## Water Regime Chart

### `src/workspace/WaterRegimeChart.tsx`

Комплексный график водного режима.

Блоки:

- атмосферные параметры;
- параметры растений;
- влагозапасы почвы;
- осадки и поливы.

Ключевые frontend-расчёты:

- ET приоритетно строится как
  `actual_transpiration_mm + actual_soil_evaporation_mm`;
- если обе составляющие отсутствуют, используется
  `actual_evapotranspiration_mm`;
- если испарение почвы есть, а транспирации нет, транспирация считается `0`;
- НВ (`soil_field_capacity_water_mm`) является верхней границей водного блока;
- ВЗ (`soil_wilting_point_capacity_water_mm`) рисуется отдельной оранжевой
  линией;
- график влагозапасов рисуется в координатах дефицита от НВ вниз;
- диапазон регулирования считается frontend preference в долях НВ;
- минимальный полив в tooltip блока осадков считается тем же способом, что и
  в таблице ввода поливов.

UI-состояние:

- диапазон регулирования хранится в localStorage по `storageScope`;
- `min/max` вводятся с шагом `0.01`;
- минимальный разрыв `max - min` равен `0.05`;
- легенда графиков подсвечивает выбранный ряд и затемняет остальные графики.

CSV/export:

- `buildProfileCsv` экспортирует все profile metrics и derived rows, которые
  нужны для operational review.

Guardrail: при добавлении backend metric обновить `src/config/metrics.ts`,
визуализацию/CSV и contract checks.

## Irrigation Input

### `src/workspace/IrrigationInputTable.tsx`

Таблица ввода поливов.

Источники состояния:

- backend active projection из `irrigation-layer/current`;
- local draft в localStorage только для несохранённых правок;
- `managedScope` из current-context;
- frontend-calculated minimum irrigation hints для current day и forecast days.

Правила редактирования:

- ячейка редактируема только внутри `managedScope`;
- весь ввод read-only, если backend не выдал `current_editable` и
  `submitAllowed=true`;
- пустые, нулевые, отрицательные и NaN значения не отправляются;
- `clientDiff` строится относительно backend active projection;
- submit base - текущий displayed calculation run;
- после approval frontend опрашивает status endpoint и перечитывает context.

Минимальный полив в placeholder:

- считается как `max(0, fieldCapacity * regulationRange.min - currentWater)`;
- значения меньше `5 мм` не показываются;
- placeholder не входит в `values`, localStorage или approval payload;
- после пользовательского approval рекомендации перечитываются через backend
  map API и пересчитываются.

Календарь:

- отдельная правая календарная карточка;
- горизонтальная прокрутка ограничена календарной частью;
- строки синхронизированы с карточками единого `FieldSelectorPanel`;
- при входе вкладка центрирует текущий день.

## Presentation Helpers

### `src/workspace/exportUtils.ts`

CSV и PNG export helpers. Компоненты экспорта могут быть скрыты CSS без
удаления кода, чтобы вернуть их в будущей версии.

### `src/workspace/format.ts`

Единые форматтеры чисел, площадей и date offsets.

### `src/workspace/warningPresentation.ts`

Фильтрует служебные backend-warning codes, которые не должны попадать в
пользовательский UI.

### `src/workspace/fieldStatusPresentation.ts`

Legacy presentation mapping для backend status codes. Новые зоны влагозапасов
для списка полей живут в `FieldSelectorPanel`.

### `src/workspace/StatusBadge.tsx`

Компактный badge backend status. Использовать только там, где нужен именно
backend `latestStatus`, а не frontend-зона влагозапасов.

## Derived Water Metrics

### `src/features/water-regime/derivedWaterMetrics.ts`

Чистые функции расчёта:

- доступные влагозапасы `FC - WPC`;
- текущие продуктивные влагозапасы `SWC - WPC`;
- процент продуктивных влагозапасов;
- пороги backend koef lower/optimum/upper относительно НВ.

Функции возвращают `null`, если входы неполные, нечисловые или нарушают
физический порядок.

## Metric Registry

### `src/config/metrics.ts`

Реестр 44 required FAO90 metrics.

Используется:

- API/profile contract checks;
- графиком водного режима;
- CSV export;
- smoke scripts.

Перед VDS нельзя удалять или переименовывать metric code без синхронного
изменения backend и contract scripts.

## Styling

### `src/styles.css`

Единая таблица стилей frontend.

Критичные зоны:

- root design tokens;
- workspace header;
- map/tooltip/legend styles;
- shared field selector;
- chart zones and chart legends;
- irrigation calendar geometry;
- responsive breakpoints.

Некоторые компоненты могут быть intentionally hidden:

- `.workspace-method-panel`;
- `.chart-model-caption`;
- `.export-actions`.

Их не удалять механически: они оставлены как обратимые элементы для будущих
версий.

## Browser Storage

Разрешённое хранение:

- sessionStorage: режим карты, видимость легенды поливов до logout;
- localStorage: draft ввода поливов и пользовательский диапазон регулирования
  по account/organization/season scope.

Запрещено:

- session id;
- JWT/access/refresh token;
- пароль;
- CSRF token;
- tenant permission data как источник истины.

## Environment And Build

Production:

```env
VITE_API_BASE_URL=/api
VITE_KORNIX_CALCULATION_TIMEOUT_MS=120000
```

Dev integration:

```env
VITE_API_BASE_URL=/api
KORNIX_DEV_API_PROXY_TARGET=http://host.docker.internal:8001
```

Для non-Docker Vite можно переопределить proxy target на
`http://localhost:8001`. После изменения `VITE_*` или proxy target нужно
перезапустить Vite или пересобрать production bundle.

## Deployment Files

- `Dockerfile.prod` - multi-stage production build, static nginx image.
- `docker-compose.prod.yml` - binds frontend container to local/VDS port.
- `nginx.conf` - SPA fallback, `/api/` proxy, `/healthz`, security headers,
  long API timeouts for approval/recalculation.
- `.env.production.example` - production env template.
- `.env.vds.example` - VDS-specific template.

`nginx.conf` uses Docker DNS resolver `127.0.0.11` and a variable upstream for
`/api/`. This is intentional: the static frontend container must start even
when `host.docker.internal` is not resolvable at nginx startup. If backend is
unavailable, only `/api/*` should fail at request time; SPA routes and
`/healthz` must keep working.

## Quality Gates Before Commit And VDS Deploy

Минимальный набор:

```bash
npm run typecheck
npm run test:contract
```

Production-like build/smoke:

```bash
docker build -f Dockerfile.prod -t kornix-frontend-vds-smoke .
docker run --rm -d --name kornix-frontend-vds-smoke \
  --add-host=host.docker.internal:host-gateway \
  -p 127.0.0.1:18081:80 kornix-frontend-vds-smoke
sh scripts/frontend_stage1_nginx_smoke.sh 18081
docker rm -f kornix-frontend-vds-smoke
```

Live API smoke после поднятого backend:

```bash
KORNIX_FRONTEND_ORIGIN=https://<domain> \
KORNIX_BACKEND_API_BASE_URL=https://<domain>/api \
KORNIX_SMOKE_ORGANIZATION_CODE=SP \
KORNIX_SMOKE_SEASON_YEAR=2026 \
node scripts/frontend_editable_approval_uat_smoke.mjs
```

Никогда не коммитить generated `codex_reports/`, пароли, cookies, CSRF token
values, `.env.production` или VDS private data.

## How To Extend Safely

### Add a backend profile metric

1. Добавить metric code в `REQUIRED_FAO90_METRIC_CODES`.
2. Добавить definition в `KORNIX_METRICS`.
3. Подключить отображение/CSV в `WaterRegimeChart`, если metric видимый.
4. Обновить tooltip/legend, если metric пользовательский.
5. Запустить `npm run test:contract`.

### Add a map mode

1. Расширить `MapDisplayMode`.
2. Добавить style/color/summary в `FieldMap`.
3. Добавить option и legend в `MapDisplayPanel`.
4. Решить, сохраняется ли режим в sessionStorage.
5. Проверить field tooltip and map CSV.

### Change irrigation approval

1. Проверить backend `managedScope`.
2. Не отправлять нули.
3. Сохранять draft только как draft.
4. Перечитывать current-context после approval.
5. Проверить stale-base branch.

### Change field list

1. Менять только `FieldSelectorPanel`.
2. Не создавать вторую левую плашку.
3. Проверить обе вкладки: `Водный режим` и `Ввод поливов`.
