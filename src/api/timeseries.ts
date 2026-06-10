import { getMetricDefinition, REQUIRED_FAO90_METRIC_CODES } from '../config/metrics';
import type {
  FieldSeasonMapFeatureCollection,
  KornixMetricSeriesDto,
  MetricScalarValue,
  KornixProfileTimeseriesDto,
  RequiredBackendMetricLongName
} from '../types/kornix';

const PROFILE_METRICS = REQUIRED_FAO90_METRIC_CODES;

function dateRange(from: string, to: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function dailyWave(index: number, seed: number, amplitude: number): number {
  return Math.sin((index + seed) / 4) * amplitude + Math.cos((index + seed) / 7) * amplitude * 0.35;
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function addDaysIso(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function areaWeighted(values: Array<{ value: number | null; areaHa: number | null }>) {
  const rowsWithArea = values.filter((row): row is { value: number | null; areaHa: number } =>
    typeof row.areaHa === 'number' && row.areaHa > 0
  );
  const valid = rowsWithArea.filter((row) => row.value !== null);
  const validArea = valid.reduce((sum, row) => sum + row.areaHa, 0);
  const totalArea = rowsWithArea.reduce((sum, row) => sum + row.areaHa, 0);
  if (valid.length === 0 || validArea === 0) {
    return { value: null, coverage: 0, validArea, totalArea };
  }
  return {
    value: valid.reduce((sum, row) => sum + (row.value ?? 0) * row.areaHa, 0) / validArea,
    coverage: totalArea === 0 ? 0 : validArea / totalArea,
    validArea,
    totalArea
  };
}

function scalarMetricValue(
  metric: RequiredBackendMetricLongName,
  index: number,
  seed: number,
  field: FieldSeasonMapFeatureCollection['features'][number]['properties']
): MetricScalarValue {
  if (seed % 13 === 0 && index % 11 === 0) {
    return null;
  }
  const soilWater = field.soil_water_content_mm === null
    ? null
    : Math.max(0, field.soil_water_content_mm - index * 0.45 + dailyWave(index, seed, 5));
  const taw = Math.max(1, (field.soil_field_capacity_water_mm ?? 110) - (field.soil_wilting_point_capacity_water_mm ?? 40));
  const depletion = soilWater === null ? null : Math.max(0, (field.soil_field_capacity_water_mm ?? soilWater) - soilWater);

  switch (metric) {
    case 'eto_daily_mm':
      return Math.max(0, 3.8 + (seed % 6) * 0.15 + dailyWave(index, seed, 1.1));
    case 'shortwave_radiation_daily_mj_m2':
      return Math.max(2, 18 + dailyWave(index, seed, 5));
    case 'soil_total_capacity_water_mm':
      return field.soil_total_capacity_water_mm;
    case 'soil_field_capacity_water_mm':
      return field.soil_field_capacity_water_mm;
    case 'soil_wilting_point_capacity_water_mm':
      return field.soil_wilting_point_capacity_water_mm;
    case 'soil_water_content_mm':
      return soilWater;
    case 'soil_water_start_mm':
      return soilWater === null ? null : soilWater + 0.4;
    case 'soil_water_end_mm':
      return soilWater;
    case 'soil_water_available_mm':
      return soilWater === null ? null : Math.max(0, soilWater - (field.soil_wilting_point_capacity_water_mm ?? 40));
    case 'soil_water_available_pct_taw':
      return soilWater === null ? null : Math.max(0, Math.min(100, ((soilWater - (field.soil_wilting_point_capacity_water_mm ?? 40)) / taw) * 100));
    case 'soil_water_depletion_mm':
      return depletion;
    case 'soil_water_depletion_pct_taw':
      return depletion === null ? null : Math.max(0, Math.min(100, (depletion / taw) * 100));
    case 'soil_water_productive_mm':
      return soilWater === null ? null : Math.max(0, soilWater - (field.soil_wilting_point_capacity_water_mm ?? 40));
    case 'total_available_water_mm':
      return taw;
    case 'readily_available_water_mm':
      return taw * 0.45;
    case 'root_zone_depth_m':
      return Math.min(0.6, 0.3 + index * 0.004);
    case 'positive_temperature_sum_from_sowing_c':
      return (field.positive_temperature_sum_from_sowing_c ?? 650) + index * 12 + dailyWave(index, seed, 3);
    case 'crop_transpiration_daily_mm':
      return Math.max(0, 3.1 + dailyWave(index, seed, 1.1));
    case 'crop_coefficient_kc':
      return Math.min(1.15, 0.5 + index * 0.012);
    case 'basal_crop_coefficient_kcb':
      return Math.min(1.1, 0.15 + index * 0.015);
    case 'soil_evaporation_coefficient_ke':
      return Math.max(0, 0.45 - index * 0.002 + dailyWave(index, seed, 0.04));
    case 'surface_evaporation_reduction_kr':
      return Math.max(0.2, Math.min(1, 1 - index * 0.006));
    case 'potential_crop_evapotranspiration_mm':
      return Math.max(0, 4.2 + dailyWave(index, seed, 0.8));
    case 'potential_transpiration_mm':
      return Math.max(0, 3.4 + dailyWave(index, seed, 0.7));
    case 'potential_soil_evaporation_mm':
      return Math.max(0, 0.8 + dailyWave(index, seed, 0.2));
    case 'actual_transpiration_mm':
      return Math.max(0, 2.9 + dailyWave(index, seed, 0.7));
    case 'actual_soil_evaporation_mm':
      return Math.max(0, 0.5 + dailyWave(index, seed, 0.18));
    case 'actual_evapotranspiration_mm':
      return Math.max(0, 3.4 + dailyWave(index, seed, 0.8));
    case 'actual_evapotranspiration_cumulative_mm':
      return Math.max(0, index * 3.4);
    case 'water_stress_coefficient':
      return Math.max(0.35, Math.min(1, 1 - (depletion ?? 0) / Math.max(1, taw * 1.4)));
    case 'crop_stage_code':
      return index < 17 ? 'initial' : index < 38 ? 'development' : index < 69 ? 'mid' : 'late';
    case 'days_after_sowing':
      return index;
    case 'precipitation_effective_daily_mm':
    case 'effective_precipitation_daily_mm':
      return index % 5 === seed % 5 ? Math.max(0, 3 + dailyWave(index, seed, 3)) : 0;
    case 'precipitation_raw_daily_mm':
      return index % 5 === seed % 5 ? Math.max(0, 4 + dailyWave(index, seed, 3)) : 0;
    case 'irrigation_effective_daily_mm':
    case 'effective_irrigation_daily_mm':
      return index % 13 === seed % 13 ? 12 : 0;
    case 'irrigation_raw_daily_mm':
      return index % 13 === seed % 13 ? 15 : 0;
    case 'drainage_runoff_daily_mm':
      return index % 9 === seed % 9 ? 1.5 : 0;
    case 'calculation_diagnostics_json':
      return { residual_mm: 0, continuity_error_mm: 0 };
    case 'calculation_warnings_json':
      return [];
    default:
      return null;
  }
}

export function buildMockProfileTimeseries(params: {
  calculationRunId: string;
  fieldSeasonIds: string[];
  fields: FieldSeasonMapFeatureCollection;
}): KornixProfileTimeseriesDto {
  const from = '2026-04-01';
  const serverDate = todayIso();
  const to = addDaysIso(serverDate, 7);
  const days = dateRange(from, to);
  const selected = params.fields.features.filter((feature) =>
    params.fieldSeasonIds.includes(feature.properties.fieldSeasonId)
  );
  const seriesFields = selected.length > 0 ? selected : params.fields.features;
  const aggregation =
    seriesFields.length > 1
      ? {
          mode: 'area_weighted_mean' as const,
          selectedFieldCount: seriesFields.length,
          totalAreaHa: seriesFields.reduce((sum, feature) => sum + (feature.properties.areaHa ?? 0), 0)
        }
      : null;

  const metrics: KornixMetricSeriesDto[] = PROFILE_METRICS.map((longName) => {
    const metric = getMetricDefinition(longName);

    if (longName === 'air_temperature_daily_c' || longName === 'relative_humidity_daily_pct') {
      return {
        long_name_for_code: longName,
        label: metric.label,
        unit: longName === 'air_temperature_daily_c' ? '°C' : '%',
        valueKind: 'min_mean_max',
        chartKind: 'line',
        points: days.map((day, index) => {
          const rows = seriesFields.map((feature) => {
            const seed = hashString(`${feature.properties.fieldSeasonId}:${params.calculationRunId}`);
            const mean =
              longName === 'air_temperature_daily_c'
                ? 18 + dailyWave(index, seed, 4)
                : Math.max(35, Math.min(95, 70 + dailyWave(index, seed, 10)));
            return { value: mean, areaHa: feature.properties.areaHa };
          });
          const mean = areaWeighted(rows);
          const value = mean.value;
          return {
            day,
            min: value === null ? null : round1(value - (longName === 'air_temperature_daily_c' ? 5 : 12)),
            mean: value === null ? null : round1(value),
            max: value === null ? null : round1(value + (longName === 'air_temperature_daily_c' ? 6 : 10)),
            coverage: mean.coverage,
            contributingAreaHa: mean.validArea,
            totalAreaHa: mean.totalArea
          };
        })
      };
    }

    if (longName === 'wind_daily_mps') {
      return {
        long_name_for_code: longName,
        label: metric.label,
        unit: 'м/с',
        valueKind: 'mean_max_gust',
        chartKind: 'line',
        points: days.map((day, index) => {
          const rows = seriesFields.map((feature) => {
            const seed = hashString(`${feature.properties.fieldSeasonId}:${params.calculationRunId}`);
            return {
              value: Math.max(0.5, 3.2 + dailyWave(index, seed, 1.2)),
              areaHa: feature.properties.areaHa
            };
          });
          const mean = areaWeighted(rows);
          return {
            day,
            mean: mean.value === null ? null : round1(mean.value),
            maxGust: mean.value === null ? null : round1(mean.value * 1.8),
            coverage: mean.coverage,
            contributingAreaHa: mean.validArea,
            totalAreaHa: mean.totalArea
          };
        })
      };
    }

    return {
      long_name_for_code: longName,
      label: metric.label,
      unit: metric.unit,
      valueKind: 'scalar',
      chartKind: metric.chartKind,
      points: days.map((day, index) => {
        const firstValue = scalarMetricValue(longName, index, hashString(`${seriesFields[0]?.properties.fieldSeasonId ?? 'mock'}:${params.calculationRunId}`), seriesFields[0]?.properties ?? params.fields.features[0].properties);
        if (typeof firstValue !== 'number') {
          return {
            day,
            value: firstValue,
            coverage: 1,
            contributingAreaHa: seriesFields.reduce((sum, feature) => sum + (feature.properties.areaHa ?? 0), 0),
            totalAreaHa: seriesFields.reduce((sum, feature) => sum + (feature.properties.areaHa ?? 0), 0)
          };
        }
        const rows = seriesFields.map((feature) => {
          const seed = hashString(`${feature.properties.fieldSeasonId}:${params.calculationRunId}`);
          const value = scalarMetricValue(longName, index, seed, feature.properties);
          return {
            value: typeof value === 'number' ? value : null,
            areaHa: feature.properties.areaHa
          };
        });
        const result = areaWeighted(rows);
        return {
          day,
          value: result.value === null ? null : round1(result.value),
          coverage: result.coverage,
          contributingAreaHa: result.validArea,
          totalAreaHa: result.totalArea
        };
      })
    };
  });

  return {
    organizationCode: 'SP',
    seasonYear: 2026,
    calculationRunId: params.calculationRunId,
    window: {
      from,
      to,
      timezone: 'Europe/Moscow'
    },
    serverDate,
    forecastStartDate: addDaysIso(serverDate, 1),
    forecastEndDate: addDaysIso(serverDate, 7),
    selectedFieldSeasonIds: seriesFields.map((feature) => feature.properties.fieldSeasonId),
    aggregation,
    metrics,
    recommendations: seriesFields
      .filter((feature) => feature.properties.recommended_irrigation_date)
      .map((feature) => ({
        fieldSeasonId: feature.properties.fieldSeasonId,
        recommended_irrigation_date: feature.properties.recommended_irrigation_date,
        recommended_irrigation_mm: feature.properties.recommended_irrigation_mm,
        recommended_irrigation_priority: feature.properties.latestStatus === 'critical' ? 'critical' : 'warning',
        recommended_irrigation_confidence: 0.82
      })),
    warnings:
      seriesFields.length > 1
        ? [{ code: 'MOCK_COVERAGE', message: 'Mock-агрегация содержит точки с неполным покрытием.' }]
        : []
  };
}
