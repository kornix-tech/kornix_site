import type { KornixMetricDefinition, RequiredBackendMetricLongName } from '../types/kornix';

type MetricDraft = Omit<KornixMetricDefinition, 'isEnabled'>;

function metric(definition: MetricDraft): KornixMetricDefinition {
  return { ...definition, isEnabled: true };
}

export const REQUIRED_FAO90_METRIC_CODES: RequiredBackendMetricLongName[] = [
  'air_temperature_daily_c',
  'relative_humidity_daily_pct',
  'wind_daily_mps',
  'eto_daily_mm',
  'shortwave_radiation_daily_mj_m2',
  'soil_total_capacity_water_mm',
  'soil_field_capacity_water_mm',
  'soil_wilting_point_capacity_water_mm',
  'soil_water_content_mm',
  'positive_temperature_sum_from_sowing_c',
  'crop_transpiration_daily_mm',
  'precipitation_effective_daily_mm',
  'irrigation_effective_daily_mm',
  'soil_water_start_mm',
  'soil_water_end_mm',
  'soil_water_available_mm',
  'soil_water_available_pct_taw',
  'soil_water_depletion_mm',
  'soil_water_depletion_pct_taw',
  'soil_water_productive_mm',
  'total_available_water_mm',
  'readily_available_water_mm',
  'root_zone_depth_m',
  'precipitation_raw_daily_mm',
  'effective_precipitation_daily_mm',
  'irrigation_raw_daily_mm',
  'effective_irrigation_daily_mm',
  'drainage_runoff_daily_mm',
  'crop_coefficient_kc',
  'basal_crop_coefficient_kcb',
  'soil_evaporation_coefficient_ke',
  'surface_evaporation_reduction_kr',
  'potential_crop_evapotranspiration_mm',
  'potential_transpiration_mm',
  'potential_soil_evaporation_mm',
  'actual_transpiration_mm',
  'actual_soil_evaporation_mm',
  'actual_evapotranspiration_mm',
  'actual_evapotranspiration_cumulative_mm',
  'water_stress_coefficient',
  'crop_stage_code',
  'days_after_sowing',
  'calculation_diagnostics_json',
  'calculation_warnings_json'
];

export const KORNIX_METRICS: KornixMetricDefinition[] = [
  metric({ long_name_for_code: 'air_temperature_daily_c', label: 'Температура воздуха', unit: '°C', valueKind: 'min_mean_max', chartKind: 'line', group: 'weather', isDefaultVisible: true }),
  metric({ long_name_for_code: 'relative_humidity_daily_pct', label: 'Относительная влажность', unit: '%', valueKind: 'min_mean_max', chartKind: 'line', group: 'weather', isDefaultVisible: true }),
  metric({ long_name_for_code: 'wind_daily_mps', label: 'Ветер', unit: 'м/с', valueKind: 'mean_max_gust', chartKind: 'line', group: 'weather', isDefaultVisible: true }),
  metric({ long_name_for_code: 'eto_daily_mm', label: 'ETo', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'line', group: 'weather', isDefaultVisible: true }),
  metric({ long_name_for_code: 'shortwave_radiation_daily_mj_m2', label: 'Солнечная радиация', unit: 'МДж/м²/сутки', valueKind: 'scalar', chartKind: 'line', group: 'weather', isDefaultVisible: true }),
  metric({ long_name_for_code: 'precipitation_raw_daily_mm', label: 'Осадки raw', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'bar', group: 'weather', isDefaultVisible: true }),
  metric({ long_name_for_code: 'effective_precipitation_daily_mm', label: 'Эффективные осадки FAO90', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'bar', group: 'weather', isDefaultVisible: true }),
  metric({ long_name_for_code: 'precipitation_effective_daily_mm', label: 'Эффективные осадки legacy', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'bar', group: 'weather', isDefaultVisible: true }),
  metric({ long_name_for_code: 'irrigation_raw_daily_mm', label: 'Полив raw', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'bar', group: 'irrigation', isDefaultVisible: true }),
  metric({ long_name_for_code: 'effective_irrigation_daily_mm', label: 'Эффективный полив FAO90', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'bar', group: 'irrigation', isDefaultVisible: true }),
  metric({ long_name_for_code: 'irrigation_effective_daily_mm', label: 'Эффективный полив legacy', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'bar', group: 'irrigation', isDefaultVisible: true }),
  metric({ long_name_for_code: 'soil_total_capacity_water_mm', label: 'Полная влагоёмкость', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: false }),
  metric({ long_name_for_code: 'soil_field_capacity_water_mm', label: 'НВ', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: false }),
  metric({ long_name_for_code: 'soil_wilting_point_capacity_water_mm', label: 'ВЗ', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: false }),
  metric({ long_name_for_code: 'soil_water_content_mm', label: 'Влагозапасы legacy', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: false }),
  metric({ long_name_for_code: 'soil_water_start_mm', label: 'Вода в почве на начало дня', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: false }),
  metric({ long_name_for_code: 'soil_water_end_mm', label: 'Вода в почве на конец дня', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: true }),
  metric({ long_name_for_code: 'soil_water_available_mm', label: 'Доступная вода', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: true }),
  metric({ long_name_for_code: 'soil_water_available_pct_taw', label: 'Доступная вода от TAW', unit: '%', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: true }),
  metric({ long_name_for_code: 'soil_water_depletion_mm', label: 'Дефицит воды', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: true }),
  metric({ long_name_for_code: 'soil_water_depletion_pct_taw', label: 'Дефицит от TAW', unit: '%', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: false }),
  metric({ long_name_for_code: 'soil_water_productive_mm', label: 'Продуктивная вода', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: false }),
  metric({ long_name_for_code: 'total_available_water_mm', label: 'TAW', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: true }),
  metric({ long_name_for_code: 'readily_available_water_mm', label: 'RAW', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: true }),
  metric({ long_name_for_code: 'root_zone_depth_m', label: 'Глубина корневой зоны', unit: 'м', valueKind: 'scalar', chartKind: 'line', group: 'water_balance', isDefaultVisible: true }),
  metric({ long_name_for_code: 'positive_temperature_sum_from_sowing_c', label: 'Сумма положительных температур', unit: '°C', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'crop_transpiration_daily_mm', label: 'Транспирация legacy', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'crop_coefficient_kc', label: 'Kc', unit: '', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'basal_crop_coefficient_kcb', label: 'Kcb', unit: '', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'soil_evaporation_coefficient_ke', label: 'Ke', unit: '', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'surface_evaporation_reduction_kr', label: 'Kr', unit: '', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'potential_crop_evapotranspiration_mm', label: 'Потенциальная ETc', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'potential_transpiration_mm', label: 'Потенциальная транспирация', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'potential_soil_evaporation_mm', label: 'Потенциальное испарение почвы', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'actual_transpiration_mm', label: 'Фактическая транспирация', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: true }),
  metric({ long_name_for_code: 'actual_soil_evaporation_mm', label: 'Фактическое испарение почвы', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'actual_evapotranspiration_mm', label: 'Фактическая ET', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: true }),
  metric({ long_name_for_code: 'actual_evapotranspiration_cumulative_mm', label: 'Накопленная фактическая ET', unit: 'мм', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: true }),
  metric({ long_name_for_code: 'water_stress_coefficient', label: 'Коэффициент водного стресса', unit: '', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: true }),
  metric({ long_name_for_code: 'crop_stage_code', label: 'Фаза культуры', unit: '', valueKind: 'scalar', chartKind: 'table', group: 'plant', isDefaultVisible: true }),
  metric({ long_name_for_code: 'days_after_sowing', label: 'Дней после сева', unit: 'дн.', valueKind: 'scalar', chartKind: 'line', group: 'plant', isDefaultVisible: false }),
  metric({ long_name_for_code: 'drainage_runoff_daily_mm', label: 'Дренаж/сток', unit: 'мм/сутки', valueKind: 'scalar', chartKind: 'bar', group: 'diagnostics', isDefaultVisible: true }),
  metric({ long_name_for_code: 'calculation_diagnostics_json', label: 'Диагностика расчёта', unit: '', valueKind: 'scalar', chartKind: 'diagnostics', group: 'diagnostics', isDefaultVisible: false }),
  metric({ long_name_for_code: 'calculation_warnings_json', label: 'Предупреждения расчёта', unit: '', valueKind: 'scalar', chartKind: 'diagnostics', group: 'diagnostics', isDefaultVisible: false })
];

export function getMetricDefinition(code: RequiredBackendMetricLongName | string): KornixMetricDefinition {
  const definition = KORNIX_METRICS.find((metricItem) => metricItem.long_name_for_code === code);
  if (definition) {
    return definition;
  }
  return metric({
    long_name_for_code: code as RequiredBackendMetricLongName,
    label: code,
    unit: '',
    valueKind: 'scalar',
    chartKind: 'table',
    group: 'diagnostics',
    isDefaultVisible: false
  });
}
