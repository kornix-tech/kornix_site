import { getMetricDefinition } from '../config/metrics';
import type {
  FieldSeasonMapFeatureCollection,
  KornixMetricCode,
  WaterRegimeTimeseriesDto
} from '../types/kornix';

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
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function dailyWave(index: number, seed: number, amplitude: number): number {
  return Math.sin((index + seed) / 4) * amplitude + Math.cos((index + seed) / 7) * amplitude * 0.35;
}

function scalarValue(
  metric: KornixMetricCode,
  basePct: number,
  index: number,
  seed: number,
  baseTemperatureSum: number | null
): number | null {
  if (seed % 13 === 0 && index % 11 === 0) {
    return null;
  }

  switch (metric) {
    case 'current_water_percent':
      return Math.max(10, Math.min(95, basePct - index * 0.8 + dailyWave(index, seed, 7)));
    case 'current_water_mm':
      return Math.max(0, basePct * 1.25 - index * 0.9 + dailyWave(index, seed, 6));
    case 'available_water_mm':
      return 110 + (seed % 30);
    case 'water_demand_mm':
      return Math.max(0, 50 - basePct * 0.5 + index * 0.55 + dailyWave(index, seed, 4));
    case 'relative_humidity_mean_pct':
      return Math.max(35, Math.min(95, 70 + dailyWave(index, seed, 10)));
    case 'wind_speed_2m_mean_mps':
      return Math.max(0.5, 3.2 + dailyWave(index, seed, 1.2));
    case 'potential_evapotranspiration_daily_mm':
      return Math.max(0, 3.8 + (seed % 6) * 0.15 + dailyWave(index, seed, 1.1));
    case 'temperature_sum_from_sowing_c':
      return Math.max(0, (baseTemperatureSum ?? 620 + (seed % 130)) + index * 14 + dailyWave(index, seed, 3));
    case 'actual_evapotranspiration_sum_mm':
      return Math.max(0, 8 + (seed % 14) + index * 2.4 + dailyWave(index, seed, 0.7));
    case 'precipitation_mm':
      return index % 5 === seed % 5 ? Math.max(0, 3 + dailyWave(index, seed, 3)) : 0;
    case 'actual_irrigation_mm':
      return index % 13 === seed % 13 ? 12 : 0;
    case 'effective_irrigation_mm':
      return index % 13 === seed % 13 ? 10.2 : 0;
    case 'recommended_irrigation_mm':
      return basePct < 50 && index % 6 === seed % 6 ? 18 : 0;
    default:
      return null;
  }
}

function areaWeighted(values: Array<{ value: number | null; areaHa: number }>) {
  const valid = values.filter((row) => row.value !== null);
  const validArea = valid.reduce((sum, row) => sum + row.areaHa, 0);
  const totalArea = values.reduce((sum, row) => sum + row.areaHa, 0);
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

export function buildMockTimeseries(params: {
  fieldSeasonIds: string[];
  metric: KornixMetricCode;
  from: string;
  to: string;
  aggregation: 'area_weighted_mean';
  fields: FieldSeasonMapFeatureCollection;
}): WaterRegimeTimeseriesDto {
  const metric = getMetricDefinition(params.metric);
  const days = dateRange(params.from, params.to);
  const selected = params.fields.features.filter((feature) =>
    params.fieldSeasonIds.includes(feature.properties.fieldSeasonId)
  );

  const aggregation =
    selected.length > 1
      ? {
          mode: 'area_weighted_mean' as const,
          selectedFieldSeasonIds: selected.map((feature) => feature.properties.fieldSeasonId),
          selectedFieldCount: selected.length,
          totalAreaHa: selected.reduce((sum, feature) => sum + feature.properties.areaHa, 0)
        }
      : null;

  const warnings: Array<{ code: string; message: string }> = [];

  if (metric.valueKind === 'range') {
    const points = days.map((day, index) => {
      const values = selected.map((feature) => {
        const seed = hashString(feature.properties.fieldSeasonId);
        const base = feature.properties.currentWaterMm ?? 60;
        return {
          lower: Math.max(0, base - 20 + dailyWave(index, seed, 3)),
          upper: Math.max(0, base + 20 + dailyWave(index, seed, 3)),
          areaHa: feature.properties.areaHa
        };
      });
      const lower = areaWeighted(values.map((row) => ({ value: row.lower, areaHa: row.areaHa })));
      const upper = areaWeighted(values.map((row) => ({ value: row.upper, areaHa: row.areaHa })));
      return {
        day,
        lower: lower.value === null ? null : Number(lower.value.toFixed(1)),
        upper: upper.value === null ? null : Number(upper.value.toFixed(1)),
        coverage: lower.coverage,
        contributingAreaHa: lower.validArea,
        totalAreaHa: lower.totalArea
      };
    });
    return {
      metric: params.metric,
      label: metric.label,
      unit: metric.unit,
      valueKind: 'range',
      from: params.from,
      to: params.to,
      aggregation,
      warnings,
      points
    };
  }

  if (metric.valueKind === 'min_mean_max') {
    const points = days.map((day, index) => {
      const minRows = selected.map((feature) => {
        const seed = hashString(feature.properties.fieldSeasonId);
        const mean = 18 + dailyWave(index, seed, 4);
        return { value: mean - 5, areaHa: feature.properties.areaHa };
      });
      const meanRows = selected.map((feature) => {
        const seed = hashString(feature.properties.fieldSeasonId);
        return { value: 18 + dailyWave(index, seed, 4), areaHa: feature.properties.areaHa };
      });
      const maxRows = selected.map((feature) => {
        const seed = hashString(feature.properties.fieldSeasonId);
        const mean = 18 + dailyWave(index, seed, 4);
        return { value: mean + 6, areaHa: feature.properties.areaHa };
      });
      const min = areaWeighted(minRows);
      const mean = areaWeighted(meanRows);
      const max = areaWeighted(maxRows);
      return {
        day,
        min: min.value === null ? null : Number(min.value.toFixed(1)),
        mean: mean.value === null ? null : Number(mean.value.toFixed(1)),
        max: max.value === null ? null : Number(max.value.toFixed(1)),
        coverage: mean.coverage,
        contributingAreaHa: mean.validArea,
        totalAreaHa: mean.totalArea
      };
    });
    return {
      metric: params.metric,
      label: metric.label,
      unit: metric.unit,
      valueKind: 'min_mean_max',
      from: params.from,
      to: params.to,
      aggregation,
      warnings,
      points
    };
  }

  const points = days.map((day, index) => {
    const rows = selected.map((feature) => {
      const seed = hashString(feature.properties.fieldSeasonId);
      return {
        value: scalarValue(
          params.metric,
          feature.properties.currentWaterPercent ?? 50,
          index,
          seed,
          feature.properties.temperatureSumFromSowingC ?? null
        ),
        areaHa: feature.properties.areaHa
      };
    });
    const result = areaWeighted(rows);
    if (result.coverage > 0 && result.coverage < 0.7) {
      warnings.push({
        code: 'LOW_COVERAGE',
        message: 'Часть точек агрегата рассчитана по неполному покрытию площади.'
      });
    }
    return {
      day,
      value: result.value === null ? null : Number(result.value.toFixed(1)),
      coverage: result.coverage,
      contributingAreaHa: result.validArea,
      totalAreaHa: result.totalArea
    };
  });

  return {
    metric: params.metric,
    label: metric.label,
    unit: metric.unit,
    valueKind: 'scalar',
    from: params.from,
    to: params.to,
    aggregation,
    warnings: Array.from(new Map(warnings.map((warning) => [warning.code, warning])).values()),
    points
  };
}
