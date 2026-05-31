# KORNIX System API Requirements v0.2

Дата обновления: 2026-05-31
Статус: frontend-driven requirements for backend implementation
Система: KORNIX Water Intelligence frontend
Стек frontend: React, TypeScript, Vite, Leaflet, Recharts, Docker/Nginx

## 1. Назначение

Документ описывает актуальные требования к HTTP API системы KORNIX, необходимому для production-подключения frontend к DB-first backend.

Frontend не реализует backend API, не подключается к PostgreSQL/TimescaleDB/PostGIS напрямую и не использует KML как production runtime source of truth. Источник истины для production — backend KORNIX поверх доменной базы данных и расчётного слоя.

## 2. Принципы API

1. Frontend работает только через HTTP(S) API.
2. Backend применяет tenant/organization/farm scope из server-side session.
3. Frontend не передаёт `organizationId` как доверенный фильтр.
4. Основной идентификатор выбора в UI — `fieldSeasonId`.
5. `fieldId` — стабильный идентификатор физического/агрономического поля.
6. Backend возвращает только данные, доступные authenticated user.
7. Отсутствующие значения возвращаются как `null`, а не как `0`.
8. `0` означает подтверждённый ноль.
9. Фактический полив, эффективный полив, плановый полив и рекомендация не смешиваются.
10. Агрегация нескольких полей должна быть средневзвешенной по площади.
11. Backend возвращает coverage/data-quality metadata для агрегатов.
12. Domain states (`not_calculated`, `readiness_blocked`) не должны маскироваться под HTTP 500.

## 3. Source of Truth

Backend должен опираться на DB-first слой KORNIX:

- `meteo.field_seasons`;
- `meteo.agro_fields`;
- `meteo.field_weather_point_mapping`;
- `meteo.field_daily_forcing`;
- `meteo.water_balance_daily_results`;
- `meteo.irrigation_recommendations`;
- `meteo.water_balance_runs`;
- readiness/run status tables or views.

KML может использоваться как импортный источник геометрии, но не как runtime API source.

## 4. Auth and Session

Production-направление: BFF/session-cookie + внешний OIDC provider.

Frontend не должен хранить:

- access token;
- refresh token;
- JWT;
- session id;
- client secret.

Required endpoints:

```http
GET  /api/v1/me
GET  /api/v1/auth/login?returnTo=/map
POST /api/v1/auth/logout
```

Session cookie requirements:

- `HttpOnly`;
- `Secure` in production;
- `SameSite=Lax` or `SameSite=Strict`;
- server-side session rotation after login;
- no token exposure to browser JavaScript.

Frontend sends API requests with:

```text
credentials: include
Accept: application/json
X-Requested-With: XMLHttpRequest
```

`returnTo` must be validated by both frontend and backend. Backend must allow only same-site application paths.

## 5. Authorization and Tenant Boundary

Backend must enforce:

- user-to-organization access;
- user-to-farm access;
- user-to-field-season access;
- role-based permissions.

Supported roles:

```ts
type AuthRole = 'admin' | 'farm_operator' | 'viewer' | 'service_admin';
```

HTTP interpretation:

- `401`: anonymous or expired session;
- `403`: authenticated but forbidden;
- `404`: resource absent inside allowed scope or intentionally hidden;
- `422`: malformed or invalid query/domain input;
- `500`: unexpected backend failure.

## 6. URL State Expected by Frontend

Frontend routes:

```text
/map
/map?day=2026-05-31
/water-regime
/water-regime?fields=fs_1,fs_2&from=2026-05-01&to=2026-05-31
/water-regime?fields=none
/irrigation
```

Rules:

- `/water-regime` without `fields` means default all fields selected.
- `fields=none` means explicit empty selection.
- Map date defaults to current date.
- Chart date range defaults to latest 30 days ending current date.
- Chart forecast must include 7 days after current date.
- `/irrigation` shows irrigation input calendar from April 1 of the season to current forecast horizon.
- URL values are client-validated, but backend must still validate all inputs.

## 7. Required Endpoint Matrix

| Area | Endpoint | MVP | Notes |
| --- | --- | ---: | --- |
| Auth | `GET /api/v1/me` | yes | current user/session |
| Auth | `GET /api/v1/auth/login` | yes | redirect to OIDC/BFF login |
| Auth | `POST /api/v1/auth/logout` | yes | clear session |
| Context | `GET /api/v1/kornix/current-context?seasonYear=2026` | yes | organization/farm/season/readiness |
| Map | `GET /api/v1/kornix/field-seasons/map?seasonYear=2026&day=YYYY-MM-DD` | yes | GeoJSON + daily values |
| Summary | `GET /api/v1/kornix/field-seasons/current-water-regime` | recommended | may be merged into map endpoint for MVP |
| Timeseries | `GET /api/v1/kornix/water-regime/timeseries` | yes | one metric per request |
| Profile timeseries | `GET /api/v1/kornix/water-regime/profile-timeseries` | recommended | batch endpoint for chart performance |
| Irrigation input | `GET /api/v1/kornix/irrigation-events?seasonYear=2026&from=YYYY-MM-DD&to=YYYY-MM-DD` | recommended | fact and planned irrigation calendar |
| Irrigation input | `PUT /api/v1/kornix/irrigation-events` | recommended | save fact/planned irrigation values |
| Metrics | `GET /api/v1/kornix/metrics` | recommended | metadata and units |
| Readiness | `GET /api/v1/kornix/readiness/current?seasonYear=2026` | recommended | blockers and calculation state |
| Runs | `GET /api/v1/kornix/runs/latest?seasonYear=2026` | recommended | latest run, freshness, model version |

Backend implementation status values:

```text
not_started
planned
implemented
partially_implemented
needs_frontend_validation
ready
blocked
```

## 8. Common Error Contract

All non-2xx JSON API errors should use:

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

Examples:

```json
{
  "error": {
    "code": "INVALID_FIELD_SEASON_IDS",
    "message": "One or more fieldSeasonIds are invalid or inaccessible.",
    "requestId": "req_01..."
  }
}
```

```json
{
  "error": {
    "code": "KORNIX_READINESS_BLOCKED",
    "message": "KORNIX calculation is not ready for the selected season.",
    "details": {
      "blockers": [
        {
          "severity": "P0",
          "code": "NOT_READY_FORCING_OR_MAPPING",
          "message": "Missing field_daily_forcing rows."
        }
      ]
    },
    "requestId": "req_02..."
  }
}
```

## 9. Current User DTO

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

## 10. Current Context API

```http
GET /api/v1/kornix/current-context?seasonYear=2026
```

Response:

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

Readiness:

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

## 11. Map API

```http
GET /api/v1/kornix/field-seasons/map?seasonYear=2026&day=2026-05-31
```

Requirements:

- response is GeoJSON `FeatureCollection`;
- CRS is WGS84 / EPSG:4326;
- geometry is `Polygon` or `MultiPolygon`;
- geometry is valid, holes preserved;
- each feature represents one `fieldSeasonId`;
- daily values correspond to requested `day`;
- backend applies tenant scope.

Response:

```ts
export type FieldSeasonMapFeatureCollectionDto = GeoJSON.FeatureCollection<
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

Map display modes currently supported by frontend:

- summary status: `ok`, `warning`, `critical`, `no_data`, `not_calculated`, `readiness_blocked`;
- productive water share: `currentWaterPercent`;
- precipitation sum/value for selected day or aggregation window: `precipitationMm`;
- irrigation sum/value: `actualIrrigationMm`;
- temperature sum from sowing: `temperatureSumFromSowingC`.

Backend must document whether map daily values are exact daily values, latest values, or window aggregates.

## 12. Field Tooltip Requirements

Tooltip uses:

- `fieldKey`;
- `fieldName`;
- `areaHa`;
- `cropName`;
- `latestStatus`;
- `latestWaterRegimeDay`;
- `currentWaterPercent`;
- `currentWaterMm`;
- `availableWaterMm`;
- `waterDemandMm`;
- `precipitationMm`;
- `actualIrrigationMm`;
- `recommendedIrrigationMm`;
- `dataQuality.messages`.

All text must be plain text, not trusted HTML.

## 13. Current Water Regime Summary

Recommended endpoint:

```http
GET /api/v1/kornix/field-seasons/current-water-regime?seasonYear=2026&day=2026-05-31
```

This may be merged into map endpoint for MVP. If split, response should be keyed by `fieldSeasonId`.

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

## 14. Data Quality DTO

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

Backend should add machine-readable codes in future:

```ts
type DataQualityIssueDto = {
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
};
```

## 15. Timeseries API

```http
GET /api/v1/kornix/water-regime/timeseries?fieldSeasonIds=fs_1,fs_2&metric=current_water_mm&from=2026-05-01&to=2026-06-07&aggregation=area_weighted_mean
```

Query params:

| Param | Required | Description |
| --- | --- | --- |
| `fieldSeasonIds` | yes | comma-separated ids, 1..N |
| `metric` | yes | one supported metric code |
| `from` | yes | ISO date `YYYY-MM-DD` |
| `to` | yes | ISO date `YYYY-MM-DD` |
| `aggregation` | yes for N > 1 | currently `area_weighted_mean` |

Requirements:

- points sorted by `day`;
- no duplicate `day`;
- daily date format `YYYY-MM-DD`;
- `null` values allowed for gaps;
- backend validates max range length;
- response includes `label`, `unit`, `valueKind`, `warnings`;
- aggregate points include coverage metadata;
- forecast dates may be returned in the same series.

## 16. Timeseries DTOs

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
```

Base:

```ts
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
  warnings: Array<{ code: string; message: string }>;
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

## 17. Chart Profile Requirements

Frontend currently draws four synchronized blocks:

1. Atmospheric parameters:
   - `temperature_daily_c`;
   - `relative_humidity_mean_pct`;
   - `wind_speed_2m_mean_mps`;
   - `potential_evapotranspiration_daily_mm`.
2. Plant parameters:
   - `temperature_sum_from_sowing_c`;
   - `actual_evapotranspiration_sum_mm`.
3. Soil water reserves:
   - `available_water_range_mm`;
   - `current_water_mm`;
   - full saturation reference line derived from or provided by backend.
4. Precipitation and irrigation:
   - `precipitation_mm`;
   - `actual_irrigation_mm`.

The graph shows:

- fact section;
- 7-day forecast section;
- vertical forecast boundary;
- faded forecast line/fill;
- common time ruler controlled by frontend.

Backend should return enough dates to cover requested `to` and at least 7 forecast days when available.

Recommended batch endpoint:

```http
GET /api/v1/kornix/water-regime/profile-timeseries?fieldSeasonIds=fs_1,fs_2&from=2026-05-01&to=2026-06-07&aggregation=area_weighted_mean
```

Response should contain the same per-metric DTOs in one payload:

```ts
export type WaterRegimeProfileTimeseriesDto = {
  from: string;
  to: string;
  forecastStart: string | null;
  metrics: Partial<Record<KornixMetricCode, WaterRegimeTimeseriesDto>>;
  warnings: Array<{ code: string; message: string }>;
};
```

## 18. Metric Registry

| Metric | Label | Unit | valueKind | chartKind | Group | Required | Source / semantics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `available_water_range_mm` | Диапазон доступных влагозапасов | мм | range | composed | water_balance | yes | backend-defined lower/upper available water band |
| `available_water_mm` | Доступные влагозапасы | мм | scalar | line | water_balance | recommended | available water capacity/value |
| `current_water_mm` | Текущие влагозапасы | мм | scalar | line | water_balance | yes | current soil water reserves |
| `current_water_percent` | % доступных влагозапасов | % | scalar | line | water_balance | yes | productive water share |
| `water_demand_mm` | Потребность во влаге | мм | scalar | line | water_balance | recommended | water demand |
| `temperature_daily_c` | Температура за сутки | °C | min_mean_max | line | weather | yes | daily min/mean/max temperature |
| `temperature_sum_from_sowing_c` | Сумма температур от даты сева | °C | scalar | line | plant | yes | accumulated temperature since sowing |
| `relative_humidity_mean_pct` | Влажность воздуха | % | scalar | line | weather | yes | mean relative humidity |
| `wind_speed_2m_mean_mps` | Скорость ветра | м/с | scalar | line | weather | yes | mean wind speed at 2 m |
| `potential_evapotranspiration_daily_mm` | Суточная потенциальная испаряемость | мм | scalar | line | weather | yes | daily potential ET/evaporation |
| `actual_evapotranspiration_sum_mm` | Фактическое суммарное испарение | мм | scalar | line | plant | yes | accumulated actual ET/evaporation |
| `precipitation_mm` | Осадки | мм | scalar | bar | weather | yes | daily precipitation |
| `actual_irrigation_mm` | Фактический полив | мм | scalar | bar | irrigation | yes | daily actual irrigation |
| `effective_irrigation_mm` | Эффективный полив | мм | scalar | bar | irrigation | recommended | effective water reaching soil |
| `recommended_irrigation_mm` | Рекомендованный полив | мм | scalar | bar | irrigation | recommended | recommendation, not actual irrigation |

Backend metric metadata endpoint should return:

```ts
export type KornixMetricDefinitionDto = {
  code: KornixMetricCode;
  label: string;
  unit: string;
  valueKind: 'scalar' | 'range' | 'min_mean_max';
  chartKind: 'line' | 'bar' | 'composed';
  group: 'water_balance' | 'weather' | 'plant' | 'irrigation';
  isEnabled: boolean;
  source?: string;
  nullPolicy?: string;
  aggregationPolicy?: string;
  rounding?: {
    decimals: number;
    mode?: 'round' | 'floor' | 'ceil';
  };
};
```

## 19. Area-Weighted Aggregation

Mode:

```text
aggregation=area_weighted_mean
```

Formula:

```text
x_agg(t) = sum(areaHa_i * x_i(t)) / sum(areaHa_i), i in S_valid(t)
```

Where `S_valid(t)` includes only fields with non-null metric value at date `t`.

Backend must return per point:

- `coverage`;
- `contributingAreaHa`;
- `totalAreaHa`.

Frontend interpretation:

- `coverage >= 0.90`: normal;
- `0.70 <= coverage < 0.90`: partial coverage warning;
- `coverage < 0.70`: low confidence warning.

Missing values must not be treated as zero.

## 20. Forecast Requirements

Frontend currently separates forecast by date:

- fact: dates up to current date;
- forecast: next 7 days.

Backend should preferably return explicit metadata:

```ts
export type ForecastMetadataDto = {
  forecastStart: string | null;
  forecastHorizonDays: number;
  generatedAt: string;
  sourceRunId?: string;
};
```

If explicit metadata is not available, frontend can use date-based split, but backend must keep values consistent across the selected range.

## 21. Null and Missing Data Policy

Required:

- `null` means no data / not calculated / not applicable;
- `0` means real zero;
- missing precipitation is not zero;
- missing irrigation is not zero unless backend has complete zero-fill policy;
- missing weather data must not be hidden;
- missing calculation result should map to `not_calculated` or `no_data`;
- chart gaps must be drawable.

Examples:

```text
precipitationMm = 0     -> confirmed zero rain
precipitationMm = null  -> no precipitation data or forcing incomplete
currentWaterPercent = null -> no calculation for this day
```

## 22. Readiness and Run Status

Backend must distinguish:

- `ready`;
- `partial`;
- `not_ready`;
- `unknown`;
- `not_calculated`;
- `readiness_blocked`;
- `forcing_incomplete`;
- `mapping_missing`;
- `calculation_missing`;
- `run_failed`;
- `parameter_safety_blocked`.

Recommended latest run DTO:

```ts
export type KornixLatestRunDto = {
  runId: string;
  seasonYear: number;
  status: 'success' | 'failed' | 'running' | 'cancelled' | 'unknown';
  startedAt: string | null;
  finishedAt: string | null;
  generatedAt: string;
  modelVersion?: string;
  calculatedFieldCount: number;
  expectedFieldCount: number;
  warnings: Array<{ code: string; message: string }>;
};
```

## 23. Irrigation Input Requirements

The irrigation input screen lets authenticated users enter irrigation depth in millimeters by `fieldSeasonId` and day.

Business meaning:

- dates before the forecast boundary are actual performed irrigation;
- dates in the forecast period are planned irrigation, but they are still calculation inputs;
- saved values must affect water-regime recalculation for affected fields and dates;
- `0` means explicit no irrigation if backend chooses to store zeroes;
- absent value means no user-entered irrigation event.

Recommended read endpoint:

```http
GET /api/v1/kornix/irrigation-events?seasonYear=2026&from=2026-04-01&to=2026-06-07
```

Recommended response:

```ts
export type IrrigationEventDto = {
  fieldSeasonId: string;
  day: string;
  irrigationMm: number;
  source: 'user_input' | 'imported' | 'model_plan';
  periodKind: 'fact' | 'plan';
  updatedAt: string;
  updatedByUserId: string;
};
```

Recommended save endpoint:

```http
PUT /api/v1/kornix/irrigation-events
Content-Type: application/json
```

```ts
export type SaveIrrigationEventsRequest = {
  seasonYear: number;
  generatedAt: string;
  forecastStart: string;
  events: Array<{
    fieldSeasonId: string;
    day: string;
    irrigationMm: number;
    periodKind: 'fact' | 'plan';
  }>;
};
```

Save rules:

- backend must authorize every `fieldSeasonId` against current user scope;
- empty frontend cells are omitted from `events` and must be treated as NULL/no user-entered irrigation;
- `irrigationMm` must be a finite positive value in documented domain range;
- deletion of previously saved values should use a separate explicit delete/null contract if needed;
- batch save must be atomic per request or return per-row validation errors;
- recalculation invalidation must be explicit: affected field seasons and days should be queued or marked stale.

## 24. Export Requirements

Current frontend exports:

- PNG of current page from browser DOM;
- CSV from current in-memory map/chart data.

Backend does not need export endpoints for MVP.

Future backend export endpoints may be added if datasets become too large:

```http
POST /api/v1/kornix/exports/water-regime.csv
POST /api/v1/kornix/exports/map-state.geojson
```

These future endpoints must apply the same auth, tenant and input validation rules.

## 25. Performance Requirements

Targets:

- map endpoint for 10-100 fields should be comfortably interactive;
- GeoJSON payload should normally remain below a few MB;
- timeseries endpoint should document max date range;
- profile chart should avoid excessive waterfall in production, preferably via batch endpoint;
- backend responses should include freshness metadata where practical;
- requests should support HTTP caching where safe.

Recommended caching:

- geometry: minutes/hours;
- current summary: 1-5 min;
- timeseries: cache by selected ids, metric, date range and aggregation;
- readiness: 1-5 min;
- metric metadata: long-lived cache.

## 26. Security Requirements

Backend must provide:

- strict tenant isolation;
- no wildcard CORS with credentials;
- exact allowed origins for split-origin dev;
- same-origin production preferred;
- CSRF protection for unsafe methods;
- request timeout strategy;
- rate limiting for expensive endpoints;
- request id on errors;
- no secret exposure in frontend env;
- no trusted auth/tenant params from browser query;
- validation of `fieldSeasonIds`, dates and metric codes.

Same-origin production preferred:

```text
frontend: https://kornix.example.com
api:      https://kornix.example.com/api
```

Split-origin dev:

```text
frontend: http://localhost:5173
api:      http://localhost:8000
```

Credentialed CORS:

```text
Access-Control-Allow-Origin: exact frontend origin
Access-Control-Allow-Credentials: true
```

Forbidden:

```text
Access-Control-Allow-Origin: *
with credentials
```

## 27. Validation Rules

Backend must validate:

- `seasonYear`: supported range;
- `day`, `from`, `to`: valid ISO dates;
- `from <= to`;
- max date range;
- `fieldSeasonIds`: format, count, tenant access;
- `metric`: supported code;
- `aggregation`: supported mode;
- geometry output size where relevant.

Recommended limits:

- `fieldSeasonIds`: define max count, e.g. 200;
- timeseries range: define max days, e.g. 730 for daily data;
- request timeout: define SLA and fallback errors.

## 28. Frontend Acceptance Scenarios

Backend API is ready for frontend validation when these scenarios pass:

1. Anonymous user gets `401` on `/api/v1/me`.
2. Authenticated viewer gets `/api/v1/me`.
3. Forbidden user gets `403` on KORNIX endpoints.
4. Current context returns organization, season, counts and readiness.
5. Map returns valid GeoJSON for all accessible field seasons.
6. Map with `day` changes daily values without changing field ids.
7. Tooltip fields are complete for normal data.
8. Tooltip handles `null` values and data-quality messages.
9. `/water-regime` with one field renders all chart blocks.
10. `/water-regime` with all fields uses area-weighted aggregation.
11. Aggregated points include coverage.
12. Partial coverage creates warnings.
13. Timeseries supports null gaps.
14. Weather block returns temperature, humidity, wind and daily potential ET.
15. Plant block returns accumulated temperature and accumulated actual ET.
16. Soil water block returns available water range and current water.
17. Precipitation/irrigation block returns separate bar metrics.
18. Forecast period returns 7 future days where available.
19. `/irrigation` renders field-by-date calendar from April 1 to forecast horizon.
20. Irrigation input accepts actual values for history and planned values for forecast days.
21. Saved irrigation values are visible on reload and invalidate affected calculations.
19. `fields=none` creates empty chart state without backend error.
20. Metric metadata endpoint, if implemented, matches supported metric codes.

## 29. Open Backend Questions

1. Exact semantics and source of `available_water_range_mm`.
2. Exact formula/source of `potential_evapotranspiration_daily_mm`.
3. Exact formula/source of `actual_evapotranspiration_sum_mm`.
4. Formula for `temperature_sum_from_sowing_c`: base threshold, crop-specific threshold or raw mean temperature sum.
5. Whether map values are daily, latest, or aggregated over a window.
6. Whether map summary and tooltip summary are one endpoint or two.
7. Whether backend will implement batch profile-timeseries endpoint for graph performance.
8. Max supported date range for timeseries.
9. First supported `seasonYear`.
10. Exact persistence, audit and recalculation queue semantics for user-entered irrigation events.
10. Whether `fieldSeasonIds` are UUIDs or stable textual ids.
11. Rounding policy per unit.
12. Forecast source and how forecast/fact are tagged.
13. Auth provider: Keycloak, ZITADEL, Auth0 or other.
14. Same-origin or split-origin production topology.
15. Geometry simplification strategy if payload grows.
16. How recommended irrigation relates to `irrigation_recommendations`.
17. Whether planned irrigation will be exposed separately.
18. How model version and run id should be surfaced in UI.

## 30. Definition of Done for Backend API

MVP API is done when:

- `GET /api/v1/me` works with real session;
- login/logout work through BFF/session cookie;
- current context returns readiness;
- map endpoint returns scoped GeoJSON with current values;
- timeseries endpoint supports all required MVP metrics;
- aggregation is area-weighted and returns coverage;
- null/missing-data policy is respected;
- errors use unified shape;
- tenant isolation is enforced server-side;
- production can run with `VITE_AUTH_MODE=bff`;
- production can run with `VITE_ENABLE_MOCK_API=false`;
- frontend acceptance scenarios pass.

## 31. Change Log

### v0.2

- Added current chart requirements for four graph blocks.
- Added `potential_evapotranspiration_daily_mm`.
- Kept `actual_evapotranspiration_sum_mm` as accumulated plant metric.
- Added profile-timeseries recommendation.
- Added map display mode requirements.
- Added irrigation input route and API requirements.
- Added export, forecast, validation and security sections.
- Updated auth/session and tenant boundary requirements.

### v0.1

- Initial frontend-driven API checklist.
