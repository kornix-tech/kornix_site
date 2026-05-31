import type { KornixMetricDefinition, RequiredBackendMetricLongName } from '../types/kornix';

export const KORNIX_METRICS: KornixMetricDefinition[] = [
  {
    long_name_for_code: 'air_temperature_daily_c',
    label: 'Температура воздуха',
    unit: '°C',
    valueKind: 'min_mean_max',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'relative_humidity_daily_pct',
    label: 'Относительная влажность',
    unit: '%',
    valueKind: 'min_mean_max',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'wind_daily_mps',
    label: 'Ветер',
    unit: 'м/с',
    valueKind: 'mean_max_gust',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'eto_daily_mm',
    label: 'ETo',
    unit: 'мм/сутки',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'shortwave_radiation_daily_mj_m2',
    label: 'Солнечная радиация',
    unit: 'МДж/м²/сутки',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    long_name_for_code: 'soil_total_capacity_water_mm',
    label: 'Полная влагоёмкость',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'water_balance',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'soil_field_capacity_water_mm',
    label: 'НВ',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'water_balance',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'soil_wilting_point_capacity_water_mm',
    label: 'ВЗ',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'water_balance',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'soil_water_content_mm',
    label: 'Влагозапасы почвы',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'water_balance',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'positive_temperature_sum_from_sowing_c',
    label: 'Сумма положительных температур',
    unit: '°C',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'plant',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'crop_transpiration_daily_mm',
    label: 'Транспирация культуры',
    unit: 'мм/сутки',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'plant',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'precipitation_effective_daily_mm',
    label: 'Эффективные осадки',
    unit: 'мм/сутки',
    valueKind: 'scalar',
    chartKind: 'bar',
    group: 'weather',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    long_name_for_code: 'irrigation_effective_daily_mm',
    label: 'Эффективный полив',
    unit: 'мм/сутки',
    valueKind: 'scalar',
    chartKind: 'bar',
    group: 'irrigation',
    isDefaultVisible: true,
    isEnabled: true
  }
];

export function getMetricDefinition(code: RequiredBackendMetricLongName): KornixMetricDefinition {
  const definition = KORNIX_METRICS.find((metric) => metric.long_name_for_code === code);
  if (!definition) {
    throw new Error(`Unknown KORNIX metric: ${code}`);
  }
  return definition;
}
