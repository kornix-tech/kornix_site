# KORNIX Frontend API Contract v0.1

> Archived/deprecated: этот документ описывает исторический legacy-контракт
> `/api/v1/kornix/*`. Актуальный пользовательский runtime frontend использует
> `/api/v2/kornix/*`; auth/me и CSRF остаются на `/api/v1`.

## Принципы

1. Frontend выбирает `fieldSeasonId`, а не только `fieldId`.
2. Backend определяет organization/farm scope из auth context.
3. Frontend не передаёт `organizationId` как trust-фильтр.
4. Карту питает DB-first backend, не KML-файлы.
5. Tooltip питается latest water-balance/current forcing summary.
6. Timeseries и агрегация считаются на backend.
7. `NULL` не отображается как 0.
8. `actual_irrigation_mm` и `recommended_irrigation_mm` не смешиваются.

## Frontend URL

Пользовательские экраны имеют короткие канонические адреса:

```text
/map
/map?day=2026-05-31
/water-regime?fields=fs_1,fs_2&from=2026-05-01&to=2026-05-31
/water-regime?fields=none
```

Старые query-параметры `/workspace?tab=...&fieldSeasonIds=...&mapDay=...`
разбираются для совместимости и заменяются на канонический URL через
`replace`, чтобы история браузера не засорялась промежуточными адресами.
На графике пустой `fields` в URL означает стартовый выбор всех полей; явное
состояние «ничего не выбрано» фиксируется как `fields=none`.
Даты и id полей из URL проходят клиентскую валидацию: некорректные даты
заменяются безопасными значениями по умолчанию, а список полей фильтруется по
формату id и ограничивается по длине.

## GET /api/v1/me

```ts
type CurrentUserDto = {
  id: string;
  displayName: string;
  email?: string;
  organizationId: string;
  organizationName?: string;
  farmId?: string;
  roles: Array<'admin' | 'farm_operator' | 'viewer' | 'service_admin'>;
};
```

`organizationId` используется frontend только как отображаемая информация.
Backend обязан применять tenant scope самостоятельно из authenticated session.

## GET /api/v1/kornix/current-context

```ts
type KornixCurrentContextDto = {
  organizationId: string;
  organizationName: string;
  seasonYear: number;
  fieldCount: number;
  calculationReadyFieldCount: number;
  mapBounds: null | {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
  readiness: {
    status: 'ready' | 'not_ready' | 'partial' | 'unknown';
    code: string;
    expectedFields?: number;
    actualReadyFields?: number;
    blockers: Array<{
      severity: 'P0' | 'P1' | 'P2';
      code: string;
      message: string;
    }>;
  };
};
```

## GET /api/v1/kornix/field-seasons/map?seasonYear=2026&day=2026-05-31

Возвращает GeoJSON FeatureCollection. Если передан `day`, daily-поля в `properties`
должны соответствовать выбранной дате карты. Backend по-прежнему сам применяет
tenant filter из authenticated session.

```ts
type FieldSeasonMapPropertiesDto = {
  fieldId: string;
  fieldSeasonId: string;
  fieldKey: string;
  fieldName: string;
  organizationId: string;
  seasonYear: number;
  areaHa: number;
  cropName: string | null;
  calculationReady: boolean;
  latestStatus: 'ok' | 'warning' | 'critical' | 'no_data' | 'not_calculated' | 'readiness_blocked';
  latestWaterRegimeDay: string | null;
  currentWaterPercent: number | null;
  currentWaterMm: number | null;
  availableWaterMm: number | null;
  waterDemandMm: number | null;
  precipitationMm: number | null;
  actualIrrigationMm: number | null;
  recommendedIrrigationMm: number | null;
  dataQuality: {
    forcingComplete: boolean;
    calculationAvailable: boolean;
    hasRequiredWeather: boolean;
    hasActiveMapping: boolean;
    messages: string[];
  };
};
```

## GET /api/v1/kornix/water-regime/timeseries

Query:

```text
fieldSeasonIds=fs_1,fs_2
metric=current_water_percent
from=2026-05-01
to=2026-05-30
aggregation=area_weighted_mean
```

Response:

```ts
type TimeseriesDto = {
  metric: string;
  label: string;
  unit: string;
  valueKind: 'scalar' | 'range' | 'min_mean_max';
  from: string;
  to: string;
  aggregation: null | {
    mode: 'area_weighted_mean';
    selectedFieldSeasonIds: string[];
    selectedFieldCount: number;
    totalAreaHa: number;
  };
  warnings: Array<{ code: string; message: string }>;
  points: Array<Record<string, string | number | null>>;
};
```
# Deprecated

Этот документ оставлен как исторический снимок v0.1. Для интеграции API использовать
актуальный контракт [kornix-frontend-api-v1.md](./kornix-frontend-api-v1.md).
