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
  fieldDisplayName?: string | null;
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
  soil_water_start_mm?: number | null;
  soil_water_end_mm?: number | null;
  soil_water_available_mm?: number | null;
  soil_water_available_pct_taw?: number | null;
  soil_water_depletion_mm?: number | null;
  soil_water_depletion_pct_taw?: number | null;
  soil_water_productive_mm?: number | null;
  total_available_water_mm?: number | null;
  readily_available_water_mm?: number | null;
  root_zone_depth_m?: number | null;
  precipitation_raw_daily_mm?: number | null;
  effective_precipitation_daily_mm?: number | null;
  irrigation_raw_daily_mm?: number | null;
  effective_irrigation_daily_mm?: number | null;
  drainage_runoff_daily_mm?: number | null;
  crop_coefficient_kc?: number | null;
  basal_crop_coefficient_kcb?: number | null;
  soil_evaporation_coefficient_ke?: number | null;
  surface_evaporation_reduction_kr?: number | null;
  potential_crop_evapotranspiration_mm?: number | null;
  potential_transpiration_mm?: number | null;
  potential_soil_evaporation_mm?: number | null;
  actual_transpiration_mm?: number | null;
  actual_soil_evaporation_mm?: number | null;
  actual_evapotranspiration_mm?: number | null;
  actual_evapotranspiration_cumulative_mm?: number | null;
  forecastSevenDayDate?: string | null;
  forecastSevenDayEvapotranspirationSumMm?: number | null;
  forecastSevenDayPrecipitationSumMm?: number | null;
  forecastSevenDaySoilWaterContentMm?: number | null;
  forecastSevenDayFieldCapacityWaterMm?: number | null;
  water_stress_coefficient?: number | null;
  crop_stage_code?: string | null;
  days_after_sowing?: number | null;
  calculation_diagnostics_json?: unknown;
  calculation_warnings_json?: unknown;
  positive_temperature_sum_from_sowing_c: number | null;
  crop_transpiration_daily_mm: number | null;
  recommended_irrigation_date: string | null;
  recommended_irrigation_mm: number | null;
  popupSummary?: {
    fieldDisplayName: string;
    lines: string[];
  } | null;
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
  organizationCode: string;
  seasonYear: number;
  calculationRunId: CalculationRunId;
  methodCode?: string;
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
  organizationCode: string;
  seasonYear: number;
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
  | 'irrigation_effective_daily_mm'
  | 'soil_water_start_mm'
  | 'soil_water_end_mm'
  | 'soil_water_available_mm'
  | 'soil_water_available_pct_taw'
  | 'soil_water_depletion_mm'
  | 'soil_water_depletion_pct_taw'
  | 'soil_water_productive_mm'
  | 'total_available_water_mm'
  | 'readily_available_water_mm'
  | 'root_zone_depth_m'
  | 'precipitation_raw_daily_mm'
  | 'effective_precipitation_daily_mm'
  | 'irrigation_raw_daily_mm'
  | 'effective_irrigation_daily_mm'
  | 'drainage_runoff_daily_mm'
  | 'crop_coefficient_kc'
  | 'basal_crop_coefficient_kcb'
  | 'soil_evaporation_coefficient_ke'
  | 'surface_evaporation_reduction_kr'
  | 'potential_crop_evapotranspiration_mm'
  | 'potential_transpiration_mm'
  | 'potential_soil_evaporation_mm'
  | 'actual_transpiration_mm'
  | 'actual_soil_evaporation_mm'
  | 'actual_evapotranspiration_mm'
  | 'actual_evapotranspiration_cumulative_mm'
  | 'water_stress_coefficient'
  | 'crop_stage_code'
  | 'days_after_sowing'
  | 'calculation_diagnostics_json'
  | 'calculation_warnings_json';

export type MetricScalarValue = number | string | boolean | Record<string, unknown> | unknown[] | null;
export type MetricValueKind = 'scalar' | 'min_mean_max' | 'mean_max_gust';
export type MetricChartKind = 'line' | 'bar' | 'table' | 'diagnostics';

export type KornixMetricDefinition = {
  long_name_for_code: RequiredBackendMetricLongName;
  label: string;
  unit: string;
  valueKind: MetricValueKind;
  chartKind: MetricChartKind;
  group: 'soil_water' | 'weather' | 'plant' | 'irrigation' | 'diagnostics';
  isDefaultVisible: boolean;
  isEnabled: boolean;
};

export type CurrentUserDto = AuthUser;

export type KornixFrontendMode = 'current_editable' | 'stale_read_only' | 'not_ready';

export type KornixSubmitBlockedReason =
  | null
  | string;

export type KornixManagedScopeDto = {
  dateFrom: string;
  dateTo: string;
  fieldSeasonIds: string[];
  scopeVersion: string;
};

export type KornixMethodDto = {
  methodCode: string;
  label: string;
  version: string;
  isDefault: boolean;
  isRequired: boolean;
  isCandidate?: boolean;
  methodFamily?: string | null;
};

export type KornixMethodsResponseDto = {
  defaultMethodCode: string;
  operationalMethodSetCode: string;
  methods: KornixMethodDto[];
};

export type KornixReadinessSummaryDto = {
  status: 'pass' | 'pending' | 'fail' | 'degraded';
  checkedAt: string | null;
  missingDailyForcingRows?: number;
  missingHourlySourceRows?: number;
  failedRequiredMethods?: string[];
  nextRetryAt?: string | null;
  strictFullWeatherPass?: boolean;
  operationalRequiredPass?: boolean;
  warnings?: Array<{ code: string; message: string; details?: unknown }>;
};

export type KornixCurrentContextDto = {
  organizationCode: string;
  organizationName: string;
  seasonYear: number;
  serverDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  calculationWindow: CalculationWindowDto;
  managedScope: KornixManagedScopeDto;
  currentOperationalBaseCalculationRunId: CalculationRunId | null;
  currentAppliedCalculationRunId: CalculationRunId | null;
  lastSuccessfulCalculationRunId: CalculationRunId | null;
  currentOperationalStatus:
    | 'not_started'
    | 'data_refresh_in_progress'
    | 'data_gap'
    | 'calculation_queued'
    | 'calculation_running'
    | 'completed'
    | 'failed'
    | 'degraded';
  currentAppliedStatus: 'completed' | 'not_available' | 'stale' | 'failed';
  dataFreshnessStatus:
    | 'current'
    | 'stale'
    | 'data_gap'
    | 'source_delay'
    | 'calculation_failed'
    | 'degraded';
  frontendMode: KornixFrontendMode;
  submitAllowed: boolean;
  submitBlockedReason: KornixSubmitBlockedReason;
  readinessSummary: KornixReadinessSummaryDto;
  readinessDetailsUrl: string;
  availableMethods: KornixMethodDto[];
  defaultMethodCode: string;
  fieldCount: number;
  generatedAt: string;
  mapBounds: null | {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
  warnings: Array<{ code: string; message: string }>;
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
  chartKind: MetricChartKind;
  points: Array<MetricPointBase & { value: MetricScalarValue }>;
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
  organizationCode: string;
  seasonYear: number;
  calculationRunId: CalculationRunId;
  methodCode?: string;
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

export type KornixApprovalIrrigationCellDto = {
  fieldSeasonId: string;
  irrigationDate: string;
  irrigationMm: number;
};

export type KornixApprovalClientDiffDto = {
  added: unknown[];
  updated: unknown[];
  deleted: unknown[];
};

export type KornixCurrentIrrigationLayerDto = {
  organizationCode: string;
  seasonYear: number;
  managedScope: KornixManagedScopeDto;
  irrigationLayer: Array<
    KornixApprovalIrrigationCellDto & {
      sourceLedgerEventId?: string | null;
      approvedAt?: string | null;
      zone?: 'historical_actual' | 'forecast_planned';
    }
  >;
  projectionHash: string;
  generatedAt: string;
};

export type KornixApprovalRequestDto = {
  seasonYear: number;
  baseCalculationRunId: string;
  approvalClientGeneratedAt: string;
  managedScope: KornixManagedScopeDto;
  irrigationLayer: KornixApprovalIrrigationCellDto[];
  clientDiff: KornixApprovalClientDiffDto;
};

export type KornixApprovalSubmitResponseDto = {
  approvalBatchId: string;
  calculationRunId: CalculationRunId;
  approvalStatus: 'no_changes' | 'pending_calculation' | 'applied' | 'calculation_failed';
  calculationStatus: 'reused_existing' | 'queued' | 'running' | 'completed' | 'failed';
  reusedPreviousCalculation: boolean;
  pollRequired: boolean;
  pollAfterMs?: number;
  statusUrl?: string;
  warnings: Array<{ code: string; message: string }>;
};

export type KornixApprovalStatusDto = {
  approvalBatchId: string;
  approvalStatus:
    | 'pending_calculation'
    | 'applied'
    | 'calculation_failed'
    | 'cancelled'
    | 'superseded'
    | 'no_changes';
  ledgerEventsStatus: 'pending' | 'active' | 'rejected' | 'none';
  calculationRunId: string | null;
  calculationStatus: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'reused_existing' | null;
  resultAvailable: boolean;
  pollRequired: boolean;
  warnings: Array<{ code: string; message: string }>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
};

export type KornixCalculationRunStatusDto = {
  calculationRunId: string;
  calculationStatus: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'reused_existing';
  methodCode?: string;
  methodProfileMetadata?: {
    profileCode?: string | null;
    model?: string | null;
    isOfficialAquaCrop?: boolean | null;
    [key: string]: unknown;
  } | null;
  warnings?: Array<{ code: string; message: string }>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
};
