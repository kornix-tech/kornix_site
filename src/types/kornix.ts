import type { AuthUser } from '../features/auth/types';

export type FieldWaterRegimeStatusCode =
  | 'ok'
  | 'warning'
  | 'critical'
  | 'no_data'
  | 'not_calculated'
  | 'readiness_blocked';

export type FieldDataQualityDto = {
  forcingComplete: boolean;
  calculationAvailable: boolean;
  hasRequiredWeather: boolean;
  hasActiveMapping: boolean;
  messages: string[];
};

export type FieldSeasonMapPropertiesDto = {
  fieldId: string;
  fieldSeasonId: string;
  fieldKey: string;
  fieldName: string;
  organizationId: string;
  seasonYear: number;
  areaHa: number;
  cropName: string | null;
  calculationReady: boolean;
  latestStatus: FieldWaterRegimeStatusCode;
  latestWaterRegimeDay: string | null;
  currentWaterPercent: number | null;
  currentWaterMm: number | null;
  availableWaterMm: number | null;
  waterDemandMm: number | null;
  precipitationMm: number | null;
  actualIrrigationMm: number | null;
  recommendedIrrigationMm: number | null;
  sowingDate?: string | null;
  temperatureSumFromSowingC?: number | null;
  dataQuality: FieldDataQualityDto;
};

export type FieldSeasonMapFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  FieldSeasonMapPropertiesDto
>;

export type FieldSeasonMapFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  FieldSeasonMapPropertiesDto
>;

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

export type MetricValueKind = 'scalar' | 'range' | 'min_mean_max';
export type MetricChartKind = 'line' | 'bar' | 'composed';

export type KornixMetricDefinition = {
  code: KornixMetricCode;
  label: string;
  unit: string;
  valueKind: MetricValueKind;
  chartKind: MetricChartKind;
  group: 'water_balance' | 'weather' | 'plant' | 'irrigation';
  isDefaultVisible: boolean;
  isEnabled: boolean;
};

export type CurrentUserDto = AuthUser;

export type KornixCurrentContextDto = {
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

export type WaterRegimeTimeseriesDto =
  | ScalarTimeseriesDto
  | RangeTimeseriesDto
  | MinMeanMaxTimeseriesDto;

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

export type SaveIrrigationEventsResponse = {
  accepted: boolean;
  acceptedEventCount: number;
  recalculationQueued: boolean;
  requestId?: string;
};
