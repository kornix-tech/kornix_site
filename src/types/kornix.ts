import type { AuthUser } from '../features/auth/types';

export type CalculationRunId = string;

export type FieldWaterRegimeStatusCode =
  | 'ok'
  | 'warning'
  | 'critical'
  | 'no_data'
  | 'not_calculated'
  | 'calculation_failed';

export type FieldDataQualityDto = {
  forcingComplete: boolean;
  calculationAvailable: boolean;
  hasActiveMapping: boolean;
  messages: string[];
  forcingKind?: string | null;
  metricSourceVersion?: string | null;
};

export type CalculationWindowDto = {
  from: '2026-04-01' | string;
  to: string;
  timezone: 'Europe/Moscow';
};

export type FieldSeasonMapPropertiesDto = {
  fieldId: string;
  fieldSeasonId: string;
  fieldKey: string;
  fieldName: string;
  areaHa: number | null;
  cropName: string | null;
  cropSowingDate: string | null;
  latestStatus: FieldWaterRegimeStatusCode;
  day: string;
  soil_total_capacity_water_mm: number | null;
  soil_field_capacity_water_mm: number | null;
  soil_wilting_point_capacity_water_mm: number | null;
  soil_water_content_mm: number | null;
  koef_upper_limit: number | null;
  koef_optimum: number | null;
  koef_lower_limit: number | null;
  precipitation_effective_daily_mm: number | null;
  irrigation_effective_daily_mm: number | null;
  positive_temperature_sum_from_sowing_c: number | null;
  crop_transpiration_daily_mm: number | null;
  recommended_irrigation_date: string | null;
  recommended_irrigation_mm: number | null;
  dataQuality: FieldDataQualityDto;
};

export type FieldSeasonMapFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  FieldSeasonMapPropertiesDto
>;

export type FieldSeasonMapFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  FieldSeasonMapPropertiesDto
> & {
  generatedAt: string;
  organizationCode: 'SP';
  seasonYear: 2026;
  calculationRunId: CalculationRunId;
  day: string;
  warnings?: Array<{ code: string; message: string }>;
};

export type FieldSeasonCatalogFieldDto = {
  fieldId: string;
  fieldSeasonId: string;
  fieldKey: string;
  fieldName: string;
  areaHa: number | null;
  cropName: string | null;
  cropSowingDate: string | null;
  koef_upper_limit: number | null;
  koef_optimum: number | null;
  koef_lower_limit: number | null;
  latestStatus?: FieldWaterRegimeStatusCode;
  geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};

export type FieldSeasonCatalogDto = {
  organizationCode: 'SP';
  seasonYear: 2026;
  generatedAt: string;
  fields: FieldSeasonCatalogFieldDto[];
};

export type RequiredBackendMetricLongName =
  | 'air_temperature_daily_c'
  | 'relative_humidity_daily_pct'
  | 'wind_daily_mps'
  | 'eto_daily_mm'
  | 'shortwave_radiation_daily_mj_m2'
  | 'soil_total_capacity_water_mm'
  | 'soil_field_capacity_water_mm'
  | 'soil_wilting_point_capacity_water_mm'
  | 'soil_water_content_mm'
  | 'positive_temperature_sum_from_sowing_c'
  | 'crop_transpiration_daily_mm'
  | 'precipitation_effective_daily_mm'
  | 'irrigation_effective_daily_mm';

export type MetricValueKind = 'scalar' | 'min_mean_max' | 'mean_max_gust';
export type MetricChartKind = 'line' | 'bar';

export type KornixMetricDefinition = {
  long_name_for_code: RequiredBackendMetricLongName;
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
  organizationCode: 'SP';
  organizationName: string;
  seasonYear: 2026;
  calculationWindow: CalculationWindowDto;
  serverDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  fieldCount: number;
  irrigatedFieldCount2026: number;
  latestCalculationRunId: CalculationRunId | null;
  latestCalculationStatus: 'not_calculated' | 'completed' | 'failed' | 'in_progress';
  generatedAt: string;
  mapBounds: null | {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
};

export type MetricPointBase = {
  day: string;
  coverage?: number;
  contributingAreaHa?: number;
  totalAreaHa?: number;
};

export type ScalarMetricSeriesDto = {
  long_name_for_code: RequiredBackendMetricLongName;
  label: string;
  unit: string;
  valueKind: 'scalar';
  chartKind: 'line' | 'bar';
  points: Array<MetricPointBase & { value: number | null }>;
};

export type MinMeanMaxMetricSeriesDto = {
  long_name_for_code: 'air_temperature_daily_c' | 'relative_humidity_daily_pct';
  label: string;
  unit: '°C' | '%';
  valueKind: 'min_mean_max';
  chartKind: 'line';
  points: Array<MetricPointBase & { min: number | null; mean: number | null; max: number | null }>;
};

export type WindMetricSeriesDto = {
  long_name_for_code: 'wind_daily_mps';
  label: string;
  unit: 'м/с';
  valueKind: 'mean_max_gust';
  chartKind: 'line';
  points: Array<MetricPointBase & { mean: number | null; maxGust: number | null }>;
};

export type KornixMetricSeriesDto =
  | ScalarMetricSeriesDto
  | MinMeanMaxMetricSeriesDto
  | WindMetricSeriesDto;

export type IrrigationRecommendationDto = {
  fieldSeasonId: string;
  recommended_irrigation_date: string | null;
  recommended_irrigation_mm: number | null;
  recommended_irrigation_reason_code?: string | null;
  recommended_irrigation_priority?: 'ok' | 'warning' | 'critical' | null;
  recommended_irrigation_confidence?: number | null;
};

export type KornixProfileTimeseriesDto = {
  organizationCode: 'SP';
  seasonYear: 2026;
  calculationRunId: CalculationRunId;
  window: CalculationWindowDto;
  serverDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  selectedFieldSeasonIds: string[];
  aggregation: null | {
    mode: 'area_weighted_mean';
    selectedFieldCount: number;
    totalAreaHa: number;
  };
  metrics: KornixMetricSeriesDto[];
  recommendations: IrrigationRecommendationDto[];
  warnings: Array<{ code: string; message: string }>;
};

export type IrrigationTaskDto = {
  fieldSeasonId: string;
  irrigationDate: string;
  irrigationTaskMm: number;
};

export type IrrigationTaskPayloadDto = {
  generatedAt: string;
  irrigation_tasks: IrrigationTaskDto[];
};

export type KornixCalculateRequest = {
  seasonYear: 2026;
  irrigationScenario: IrrigationTaskPayloadDto;
};

export type KornixCalculateResponse = {
  organizationCode: 'SP';
  seasonYear: 2026;
  calculationRunId: CalculationRunId;
  calculationStatus: 'completed' | 'reused_existing' | 'failed';
  irrigationScenarioHash: string;
  reusedPreviousCalculation: boolean;
  calculationWindow: CalculationWindowDto;
  serverDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  fieldCount: number;
  irrigatedFieldCount2026: number;
  timing: {
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
  };
  warnings: Array<{ code: string; message: string }>;
};
