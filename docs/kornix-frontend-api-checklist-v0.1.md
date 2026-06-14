# KORNIX Frontend API Checklist v0.1

> Archived/deprecated: чеклист ниже относится к раннему `/api/v2/kornix/*`
> контракту. Текущий frontend runtime и UAT-проверки должны использовать
> `/api/v2/kornix/*`.

Статус документа: frontend-driven contract draft.

## 1. Назначение документа

Документ фиксирует требования frontend KORNIX к backend API. Его цель — передать backend/KORNIX-разработке проверяемый список endpoint'ов, DTO, состояний и правил безопасности, необходимых для production-подключения сайта к DB-first backend.


## 2. Frontend scope

Текущий frontend показывает:

- текущий KORNIX-контекст организации и сезона;
- карту полей на `/map`;
- tooltip и текущие показатели по полю;
- переключение режима окраски карты по статусу, влагозапасам, осадкам, поливам и сумме температур;
- ручной выбор даты карты через ползунок;
- график водного режима на `/water-regime`;
- выбор одного, нескольких или всех `fieldSeasonId`;
- 4-зонный график: атмосферные параметры, параметры растений, влагозапасы почвы, осадки и поливы;
- экспорт текущего состояния страницы в PNG и данных в CSV.

Основной UI-идентификатор выбора — `fieldSeasonId`. `fieldId` нужен как стабильный идентификатор физического/агрономического поля, но график и сезонные данные выбираются по `fieldSeasonId`.

## 3. Backend/API source-of-truth assumptions

Backend является источником истины по:

- `meteo.field_seasons`;
- `meteo.agro_fields`;
- `meteo.field_weather_point_mapping`;
- `meteo.field_daily_forcing`;
- `meteo.water_balance_daily_results`;
- `meteo.irrigation_recommendations`;
- `meteo.water_balance_runs` / readiness / run status.

KML может быть import-source или seed-data, но не production runtime API source. Frontend получает только HTTP JSON/GeoJSON.

## 4. Auth/session requirements

Frontend поддерживает два режима:

- `bff`: production-default, cookie-based session через backend/BFF.

Required endpoints:

```http
GET  /api/v2/me
GET  /api/v2/auth/login?returnTo=/map
POST /api/v2/auth/logout
```

Требования:

- frontend не хранит access token, refresh token, JWT или session id в `localStorage`/`sessionStorage`;
- BFF session cookie должен быть `HttpOnly`;
- в production cookie должен быть `Secure`;
- `SameSite=Lax` или `Strict`, если бизнес-процесс не требует другого;
- frontend выполняет API-запросы с `credentials: include`;
- `401` означает anonymous/session expired;
- `403` означает authenticated, но нет прав;
- login должен принимать только безопасный `returnTo`, backend обязан повторно валидировать return URL.

## 5. Tenant and organization boundary

Backend обязан применять tenant scope из authenticated session. Frontend может отображать `organizationId`, `organizationName`, `farmId`, но не должен передавать `organizationId`/`farmId` как доверенный query-фильтр.

Правила:

- backend возвращает только поля, сезоны, readiness и временные ряды, доступные текущему пользователю;
- `fieldSeasonIds` из query должны валидироваться на принадлежность tenant scope;
- недоступные `fieldSeasonIds` должны давать `403` или доменную ошибку `INVALID_FIELD_SEASON_IDS` без раскрытия чужих id;
- один пользователь может иметь роли `admin`, `farm_operator`, `viewer`, `service_admin`.

## 6. Required endpoint checklist

| Area | Endpoint | Required for MVP | Backend status | Notes |
| --- | --- | ---: | --- | --- |
| Auth | `GET /api/v2/me` | yes | TODO | current user/session check |
| Auth | `GET /api/v2/auth/login` | yes | TODO | redirect to OIDC/BFF login |
| Auth | `POST /api/v2/auth/logout` | yes | TODO | clear server-side session |
| Context | `GET /api/v2/kornix/current-context?seasonYear=2026` | yes | TODO | org/farm/season/readiness |
| Map | `GET /api/v2/kornix/field-seasons/map?seasonYear=2026&day=YYYY-MM-DD` | yes | TODO | GeoJSON + current values |
| Tooltip | `GET /api/v2/kornix/field-seasons/current-water-regime?seasonYear=2026&day=YYYY-MM-DD` | recommended | TODO | may be merged into map endpoint |
| Chart | `GET /api/v2/kornix/water-regime/timeseries` | yes | TODO | all graph metrics |
| Metrics | `GET /api/v2/kornix/metrics` | recommended | TODO | backend/frontend metric sync |
| Readiness | `GET /api/v2/kornix/readiness/current?seasonYear=2026` | recommended | TODO | explicit blockers |
| Runs | `GET /api/v2/kornix/runs/latest?seasonYear=2026` | recommended | TODO | run id/model version/freshness |

Backend status vocabulary: `not_started`, `planned`, `implemented`, `partially_implemented`, `needs_frontend_validation`, `ready`, `blocked`.

## 7. Endpoint contracts

### 7.1 Auth/current user

```http
GET /api/v2/me
```

Responses:

- `200 CurrentUserDto` for authenticated session;
- `401 ApiErrorResponse` for anonymous/session expired;
- `500 ApiErrorResponse` for backend exception.

```http
GET /api/v2/auth/login?returnTo=/map
POST /api/v2/auth/logout
```

Backend may choose redirect-based logout (`GET /api/v2/auth/logout`) only if documented; frontend currently calls `POST`.

### 7.2 Current KORNIX context

```http
GET /api/v2/kornix/current-context?seasonYear=2026
```

Purpose:

- identify current organization/farm context;
- return active season;
- return field counts;
- return map bounds;
- return readiness summary and blockers.

### 7.3 Field map

```http
GET /api/v2/kornix/field-seasons/map?seasonYear=2026&day=2026-05-31
```

Purpose:

- return GeoJSON `FeatureCollection`;
- each feature represents one current field season;
- each feature has `fieldSeasonId`;
- geometry is `Polygon` or `MultiPolygon`;
- properties include field name/key, area, crop, status, latest water-regime summary.

`day` drives values used on the map. If omitted, backend should use latest calculated day or documented default.

### 7.4 Current water-regime summary

```http
GET /api/v2/kornix/field-seasons/current-water-regime?seasonYear=2026&day=2026-05-31
```

This endpoint is strongly recommended if map payload becomes too large. For 10-100 fields it may be merged into map endpoint, but backend must explicitly choose one contract.

### 7.5 Timeseries

```http
GET /api/v2/kornix/water-regime/timeseries?fieldSeasonIds=fs_1,fs_2&metric=current_water_mm&from=2026-05-01&to=2026-06-07&aggregation=area_weighted_mean
```

Required:

- one selected field;
- multiple selected fields;
- area-weighted aggregation;
- daily ISO date points sorted ascending;
- forecast period support;
- null gaps;
- coverage metadata for aggregate points;
- warnings for partial coverage.

### 7.6 Metric metadata

```http
GET /api/v2/kornix/metrics
```

Recommended for backend/frontend synchronization. If metric registry remains frontend-owned for MVP, backend must still support every metric code listed in section 13.

### 7.7 Readiness and run status

```http
GET /api/v2/kornix/readiness/current?seasonYear=2026
GET /api/v2/kornix/runs/latest?seasonYear=2026
```

These endpoints prevent frontend from showing an empty chart as a technical failure when real state is `not_calculated`, `readiness_blocked`, missing forcing or missing mapping.

## 8. DTO schemas

### 8.1 CurrentUserDto

```ts
export type CurrentUserDto = {
  id: string;
  displayName: string;
  email?: string;
  organizationId: string;
  organizationName?: string;
  farmId?: string;
  roles: Array<'admin' | 'farm_operator' | 'viewer' | 'service_admin'>;
};
```

### 8.2 KornixCurrentContextDto

```ts
export type KornixCurrentContextDto = {
  organizationId: string;
  organizationName: string;
  farmId?: string;
  farmName?: string;
  seasonYear: number;
  fieldCount: number;
  calculationReadyFieldCount: number;
  calculatedFieldCount?: number;
  mapBounds: null | {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
  readiness: KornixReadinessSummaryDto;
};
```

### 8.3 Readiness DTO

```ts
export type KornixReadinessSummaryDto = {
  status: 'ready' | 'not_ready' | 'partial' | 'unknown';
  code:
    | 'FIRST_92_FIELD_RUN_READY'
    | 'KML_IRRIGATED_2026'
    | 'NOT_READY_CODE_GREEN'
    | 'NOT_READY_DB_92_FIELDS_MISSING'
    | 'NOT_READY_FORCING_OR_MAPPING'
    | 'NOT_READY_PARAMETER_SAFETY'
    | 'NOT_READY_DRY_RUN_FAILED'
    | 'PARTIAL_ENV_LIMITED'
    | 'UNKNOWN'
    | string;
  expectedFields?: number;
  actualReadyFields?: number;
  blockers: Array<{
    severity: 'P0' | 'P1' | 'P2';
    code: string;
    message: string;
  }>;
};
```

### 8.4 FieldSeasonMap FeatureCollection DTO

```ts
export type FieldSeasonMapFeatureCollectionDto = {
  type: 'FeatureCollection';
  generatedAt?: string;
  seasonYear?: number;
  features: FieldSeasonMapFeatureDto[];
};

export type FieldSeasonMapFeatureDto = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  FieldSeasonMapPropertiesDto
>;

export type FieldSeasonMapPropertiesDto = {
  fieldId: string;
  fieldSeasonId: string;
  fieldKey: string;
  fieldName: string;
  organizationId?: string;
  seasonYear: number;
  areaHa: number;
  cropName: string | null;
  calculationReady: boolean;
  latestStatus:
    | 'ok'
    | 'warning'
    | 'critical'
    | 'no_data'
    | 'not_calculated'
    | 'readiness_blocked';
  latestWaterRegimeDay: string | null;
  currentWaterPercent: number | null;
  currentWaterMm: number | null;
  availableWaterMm: number | null;
  waterDemandMm: number | null;
  precipitationMm: number | null;
  actualIrrigationMm: number | null;
  effectiveIrrigationMm?: number | null;
  recommendedIrrigationMm: number | null;
  sowingDate?: string | null;
  temperatureSumFromSowingC?: number | null;
  dataQuality: FieldDataQualityDto;
};
```

### 8.5 FieldDataQualityDto

```ts
export type FieldDataQualityDto = {
  forcingComplete: boolean;
  calculationAvailable: boolean;
  hasRequiredWeather: boolean;
  hasActiveMapping: boolean;
  coverage?: number;
  messages: string[];
};
```

### 8.6 CurrentWaterRegime DTO

```ts
export type FieldCurrentWaterRegimeDto = {
  fieldSeasonId: string;
  day: string | null;
  observedAt: string | null;
  status:
    | 'ok'
    | 'warning'
    | 'critical'
    | 'no_data'
    | 'not_calculated'
    | 'readiness_blocked';
  waterBalance: {
    availableWaterMm: number | null;
    currentWaterMm: number | null;
    currentWaterPercent: number | null;
    waterDemandMm: number | null;
  };
  weather: {
    temperatureMinC: number | null;
    temperatureMeanC: number | null;
    temperatureMaxC: number | null;
    relativeHumidityMeanPct: number | null;
    windSpeed2mMeanMps: number | null;
    potentialEvapotranspirationDailyMm: number | null;
    precipitationMm: number | null;
  };
  plant: {
    sowingDate: string | null;
    temperatureSumFromSowingC: number | null;
    actualEvapotranspirationSumMm: number | null;
  };
  irrigation: {
    actualIrrigationMm: number | null;
    effectiveIrrigationMm: number | null;
    plannedIrrigationMm?: number | null;
    recommendedIrrigationMm: number | null;
  };
  dataQuality: FieldDataQualityDto;
};
```

### 8.7 Timeseries DTO

```ts
export type KornixMetricCode =
  | 'available_water_range_mm'
  | 'available_water_mm'
  | 'current_water_mm'
  | 'current_water_percent'
  | 'water_demand_mm'
  | 'temperature_daily_c'
  | 'temperature_sum_from_sowing_c'
  | 'relative_humidity_mean_pct'
  | 'wind_speed_2m_mean_mps'
  | 'potential_evapotranspiration_daily_mm'
  | 'actual_evapotranspiration_sum_mm'
  | 'precipitation_mm'
  | 'actual_irrigation_mm'
  | 'effective_irrigation_mm'
  | 'recommended_irrigation_mm';

export type TimeseriesBaseDto = {
  metric: KornixMetricCode;
  label: string;
  unit: string;
  from: string;
  to: string;
  aggregation: null | {
    mode: 'area_weighted_mean';
    selectedFieldSeasonIds: string[];
    selectedFieldCount: number;
    totalAreaHa: number;
  };
  warnings: Array<{
    code: string;
    message: string;
  }>;
};
```

Scalar:

```ts
export type ScalarTimeseriesDto = TimeseriesBaseDto & {
  valueKind: 'scalar';
  points: Array<{
    day: string;
    value: number | null;
    coverage?: number;
    contributingAreaHa?: number;
    totalAreaHa?: number;
  }>;
};
```

Range:

```ts
export type RangeTimeseriesDto = TimeseriesBaseDto & {
  valueKind: 'range';
  points: Array<{
    day: string;
    lower: number | null;
    upper: number | null;
    coverage?: number;
    contributingAreaHa?: number;
    totalAreaHa?: number;
  }>;
};
```

Min/mean/max:

```ts
export type MinMeanMaxTimeseriesDto = TimeseriesBaseDto & {
  valueKind: 'min_mean_max';
  points: Array<{
    day: string;
    min: number | null;
    mean: number | null;
    max: number | null;
    coverage?: number;
    contributingAreaHa?: number;
    totalAreaHa?: number;
  }>;
};
```

## 9. Map API requirements

Map endpoint must return:

- WGS84 / EPSG:4326 GeoJSON;
- valid `Polygon` or `MultiPolygon`;
- holes preserved;
- no self-intersections;
- `fieldSeasonId` in every feature;
- `fieldKey` and `fieldName`;
- `areaHa`;
- `cropName`;
- `latestStatus`;
- current day values for selected map day;
- data quality messages safe to render as text.

Performance target:

- 10-100 fields should load comfortably as one GeoJSON payload;
- normal payload should stay below a few MB;
- if geometry becomes heavy, backend should support simplified geometry or bbox/detail endpoint.

## 10. Field tooltip/current status requirements

Tooltip currently displays:

- field key/name;
- area, crop;
- latest water-regime day;
- status badge;
- current water percent;
- current water mm;
- available water mm;
- water demand mm;
- precipitation mm;
- actual irrigation mm;
- recommended irrigation mm;
- data-quality messages.

Backend must return `null` for missing values. Frontend escapes tooltip text before HTML rendering, but backend still must not return untrusted HTML as a presentation contract.

## 11. Water-regime timeseries requirements

Graph currently needs these series:

- atmospheric: `temperature_daily_c`, `relative_humidity_mean_pct`, `wind_speed_2m_mean_mps`, `potential_evapotranspiration_daily_mm`;
- plant: `temperature_sum_from_sowing_c`, `actual_evapotranspiration_sum_mm`;
- soil water: `available_water_range_mm`, `current_water_mm`;
- bars: `precipitation_mm`, `actual_irrigation_mm`.

Graph also shows a 7-day forecast period separated by vertical boundary. Forecast values may be in the same timeseries response; frontend fades forecast lines/fills client-side based on date.

Requirements:

- points sorted by `day` ascending;
- `day` format `YYYY-MM-DD`;
- no duplicate day per returned series;
- `null` allowed for gaps;
- support date range filters;
- document max allowed range;
- return unit and `valueKind`;
- return coverage for aggregated values;
- return warnings for partial data.

## 12. Area-weighted aggregation requirements

Frontend requests:

```text
aggregation=area_weighted_mean
```

Formula:

```text
x_agg(t) = sum(areaHa_i * x_i(t)) / sum(areaHa_i), i in S_valid(t)
```

Only valid non-null values participate. Missing values must not be averaged as `0`.

Backend must return per point:

```text
coverage = validAreaHa / totalSelectedAreaHa
contributingAreaHa
totalAreaHa
```

Frontend interpretation:

- `coverage >= 0.90`: normal;
- `0.70 <= coverage < 0.90`: partial coverage warning;
- `coverage < 0.70`: low confidence warning.

## 13. Metric registry and units

Current frontend metric registry:

| Metric | Label | Unit | valueKind | chartKind | Group | MVP | Backend source / notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `available_water_range_mm` | Диапазон доступных влагозапасов | мм | range | composed | water_balance | yes | backend must define exact semantics: soil profile/test capacity/target band |
| `available_water_mm` | Доступные влагозапасы | мм | scalar | line | water_balance | recommended | `water_balance_daily_results.available_water_mm` |
| `current_water_mm` | Текущие влагозапасы | мм | scalar | line | water_balance | yes | `water_balance_daily_results.current_water_mm` |
| `current_water_percent` | % доступных влагозапасов | % | scalar | line | water_balance | yes | `water_balance_daily_results.current_water_percent` |
| `water_demand_mm` | Потребность во влаге | мм | scalar | line | water_balance | recommended | `water_balance_daily_results.water_demand_mm` |
| `temperature_daily_c` | Температура за сутки | °C | min_mean_max | line | weather | yes | `field_daily_forcing.temperature_min/mean/max_c` |
| `temperature_sum_from_sowing_c` | Сумма температур от даты сева | °C | scalar | line | plant | yes | derived from sowing date and daily temperature |
| `relative_humidity_mean_pct` | Влажность воздуха | % | scalar | line | weather | yes | `field_daily_forcing.relative_humidity_mean_pct` |
| `wind_speed_2m_mean_mps` | Скорость ветра | м/с | scalar | line | weather | yes | `field_daily_forcing.wind_speed_2m_mean_m_s` |
| `potential_evapotranspiration_daily_mm` | Суточная потенциальная испаряемость | мм | scalar | line | weather | yes | daily potential ET / evapotranspiration; backend must define formula |
| `actual_evapotranspiration_sum_mm` | Фактическое суммарное испарение | мм | scalar | line | plant | yes | cumulative actual ET/evaporation from water balance |
| `precipitation_mm` | Осадки | мм | scalar | bar | weather | yes | `water_balance_daily_results.precipitation_mm` or forcing precipitation |
| `actual_irrigation_mm` | Фактический полив | мм | scalar | bar | irrigation | yes | actual irrigation events/results |
| `effective_irrigation_mm` | Эффективный полив | мм | scalar | bar | irrigation | recommended | `water_balance_daily_results.effective_irrigation_mm` |
| `recommended_irrigation_mm` | Рекомендованный полив | мм | scalar | bar | irrigation | recommended | recommendations/results, not actual irrigation |

Backend metric metadata should include code, label, unit, valueKind, chartKind, source field/table, null policy, aggregation policy and rounding policy.

## 14. Readiness/run-status requirements

Backend must distinguish:

- `ready`;
- `partial`;
- `not_ready`;
- `unknown`;
- `ok`;
- `warning`;
- `critical`;
- `no_data`;
- `not_calculated`;
- `readiness_blocked`;
- `forcing_incomplete`;
- `mapping_missing`;
- `calculation_missing`;
- `run_failed`;
- `parameter_safety_blocked`.

Domain readiness blockers should normally be HTTP `200` with readiness DTO. Access/session failures remain `401`/`403`.

## 15. Error response contract

Unified shape:

```ts
export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};
```

Minimum HTTP behavior:

- `400 bad_request`;
- `401 unauthenticated`;
- `403 forbidden`;
- `404 not_found`;
- `409 conflict` / invalid state;
- `422 validation_error`;
- `500 internal_error`;
- `503 service_unavailable`.

Example:

```json
{
  "error": {
    "code": "INVALID_FIELD_SEASON_IDS",
    "message": "One or more fieldSeasonIds are invalid or inaccessible.",
    "requestId": "req_..."
  }
}
```

## 16. Null/missing-data policy

Required:

- `null` means no data / not calculated / not applicable;
- `0` means confirmed real zero;
- missing precipitation is not `0`;
- missing irrigation is not `0` unless backend explicitly documents complete zero-fill;
- missing weather variable must not be hidden;
- missing calculation result should map to `not_calculated` or `no_data`;
- frontend must be able to draw gaps in charts.

Examples:

- `precipitationMm = 0`: confirmed zero precipitation;
- `precipitationMm = null`: no precipitation data or forcing incomplete;
- `currentWaterPercent = null`: no calculated value for this day.

## 17. Data quality and coverage indicators

Backend should provide:

- `forcingComplete`;
- `calculationAvailable`;
- `hasRequiredWeather`;
- `hasActiveMapping`;
- `coverage`;
- human-readable messages;
- machine-readable blocker/warning codes where possible.

Aggregated timeseries must include coverage per point. Readiness endpoints must include blockers with severity.

## 18. Performance requirements

Targets:

- map payload for 10-100 fields loads within normal interactive latency;
- timeseries endpoint supports current graph profile without excessive waterfall cost;
- backend should allow batching multiple metrics in future, because current frontend requests one metric per query;
- date ranges should have a documented maximum;
- responses should avoid unbounded geometry/detail expansion;
- export actions must not require extra backend work unless data volume grows beyond frontend CSV limits.

Recommended future optimization:

```http
GET /api/v2/kornix/water-regime/profile-timeseries?fieldSeasonIds=...&from=...&to=...&aggregation=area_weighted_mean
```

It could return all graph metrics in one payload.

## 19. Caching and freshness requirements

Recommended freshness:

- field geometry: cache minutes/hours;
- current water-regime summary: 1-5 min stale time;
- timeseries: cache by `fieldSeasonIds + metric + from + to + aggregation`;
- readiness: 1-5 min, refresh after runs;
- metrics registry: long-term cache until registry changes.

Backend should return where practical:

- `generatedAt`;
- `dataUpdatedAt`;
- `calculationRunId`;
- `latestWaterRegimeDay`;
- model version.

## 20. Security requirements

Required:

- external OIDC/BFF/session-cookie compatible;
- no browser token storage required;
- `/api/v2/me` returns current user only from server-side session;
- backend enforces tenant scope;
- frontend does not send trusted `organizationId`;
- `Set-Cookie` uses `HttpOnly`;
- production cookie uses `Secure`;
- `SameSite=Lax` or `Strict`;
- credentialed CORS uses exact origins only;
- unsafe methods protected by CSRF strategy;
- backend returns `requestId` for support/debugging;
- no secrets in frontend env;
- no client secret in `VITE_*`;
- response messages must not reveal foreign tenant identifiers.

## 21. CORS/cookie/CSRF requirements

Preferred production topology:

```text
frontend: https://kornix.example.com
api:      https://kornix.example.com/api
```

Split-origin dev:

```text
frontend: http://localhost:5173
api:      http://localhost:8000
```

Backend CORS for split-origin credentialed requests:

```text
Access-Control-Allow-Origin: exact frontend origin
Access-Control-Allow-Credentials: true
```

Not allowed:

```text
Access-Control-Allow-Origin: *
with credentials
```

CSRF:

- SameSite helps but should not be the only design;
- use Origin/Referer validation, CSRF token endpoint, or BFF anti-CSRF pattern;
- `POST /api/v2/auth/logout` must be protected consistently with other unsafe methods.

## 22. Frontend acceptance tests for API

Backend must support these validation scenarios:

1. Authenticated user with one organization and 10-100 fields.
2. Anonymous user: `/me` returns `401`.
3. Forbidden user: KORNIX endpoints return `403`.
4. Readiness ready, all fields calculated.
5. Readiness blocked, no calculated results.
6. Some fields `not_calculated`.
7. One selected field chart.
8. Multiple selected fields chart with `area_weighted_mean`.
9. Aggregation with partial coverage.
10. Timeseries with `null` gaps.
11. Tooltip with no data.
12. Tooltip with critical water status.
13. Weather chart: temperature, humidity, wind and potential ET.
14. Plant chart: accumulated temperature and actual ET.
15. Water chart: full saturation line, available water band and current water line.
16. Bar chart: precipitation and actual irrigation separated.
17. Forecast period: seven future days available and distinguishable by frontend.
18. Map date query changes map values without changing field geometry.
19. URL `/water-regime` without `fields` allows default all-field selection.
20. `fields=none` returns empty selection state without backend error.

## 23. Backend implementation checklist

Required MVP:

- [ ] Implement `GET /api/v2/me`.
- [ ] Implement BFF login redirect.
- [ ] Implement logout and session clear.
- [ ] Implement current context with readiness.
- [ ] Implement field map GeoJSON with `fieldSeasonId`.
- [ ] Include current map-day summary values or provide separate summary endpoint.
- [ ] Implement timeseries endpoint for all MVP metrics.
- [ ] Implement `area_weighted_mean`.
- [ ] Return coverage metadata.
- [ ] Return domain statuses, not just HTTP 500.
- [ ] Return unified API errors.
- [ ] Enforce tenant scope server-side.
- [ ] Validate date ranges and selected ids.
- [ ] Define metric rounding policy.
- [ ] Define forecast source and freshness.
- [ ] Document CORS/cookie/CSRF behavior.

Recommended next:

- [ ] Implement metrics metadata endpoint.
- [ ] Implement readiness/current endpoint.
- [ ] Implement runs/latest endpoint.
- [ ] Add batched profile-timeseries endpoint to reduce frontend waterfall.

## 24. Open questions for KORNIX backend

1. What is the exact backend source and semantics of `available_water_range_mm`?
2. Are map and current-water-regime returned in one endpoint or two?
3. Does backend compute area-weighted aggregation, or does it return raw series plus area?
4. What is the max allowed date range for timeseries?
5. Are weather metrics field-level, weather-point-level, grid-level, or farm-level?
6. How should backend expose `readiness_blocked` vs `not_calculated`?
7. Does current-context return one farm or multiple farms per organization?
8. What auth provider will be used: Keycloak, ZITADEL, Auth0, or other?
9. Will production be same-origin through reverse proxy or split-origin?
10. What is the first supported `seasonYear`?
11. Are `fieldSeasonIds` UUIDs or stable textual keys?
12. What is the exact rounding policy for mm, %, °C, m/s?
13. Should recommended irrigation come from `water_balance_daily_results` or `irrigation_recommendations`?
14. How should backend expose `calculationRunId` and model version in UI?
15. What payload size limit is acceptable for field GeoJSON?
16. What formula/source should define `potential_evapotranspiration_daily_mm`?
17. What formula/source should define `actual_evapotranspiration_sum_mm`?
18. Is `temperature_sum_from_sowing_c` based on mean daily temperature, base threshold, crop-specific threshold, or another agronomic rule?
19. How are forecast values distinguished in DB/API: by date only, run source, or explicit `period=fact|forecast`?
20. Should planned irrigation be exposed separately from recommendation and actual irrigation?

## 25. Final API readiness matrix

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Frontend never connects to DB directly | ready frontend-side | no DB clients in frontend |
| Backend enforces tenant scope | backend TODO | must be implemented server-side |
| `fieldSeasonId` primary UI selection id | ready frontend-side | selector, URL and chart use `fieldSeasonId` |
| Map GeoJSON contract documented | documented | sections 8-10 |
| Tooltip/current status documented | documented | section 10 |
| Timeseries contract documented | documented | sections 8, 11 |
| Area-weighted aggregation documented | documented | section 12 |
| Metric registry and units documented | documented | section 13 |
| Null/missing-data policy documented | documented | section 16 |
| Error response shape documented | documented | section 15 |
| Auth/session expectations documented | documented | section 4 |
| CORS/cookie/CSRF documented | documented | section 21 |
| Open backend questions documented | documented | 20 questions |
| Frontend acceptance scenarios documented | documented | section 22 |

Definition of DONE for backend integration:

- required MVP endpoints implemented;
- all acceptance scenarios pass against real backend;
- no frontend secret is required;
- backend returns readiness and data-quality states instead of using generic empty results for domain blockers.
# Deprecated

Этот чек-лист оставлен как исторический снимок v0.1. Для интеграции API использовать
актуальный контракт [kornix-frontend-api-v1.md](./kornix-frontend-api-v1.md).
