import type { KornixMetricCode, KornixMetricDefinition } from '../types/kornix';

export const KORNIX_METRICS: KornixMetricDefinition[] = [
  {
    code: 'available_water_range_mm',
    label: 'Диапазон доступных влагозапасов',
    unit: 'мм',
    valueKind: 'range',
    chartKind: 'composed',
    group: 'water_balance',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    code: 'current_water_percent',
    label: '% доступных влагозапасов',
    unit: '%',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'water_balance',
    isDefaultVisible: true,
    isEnabled: true
  },
  {
    code: 'current_water_mm',
    label: 'Текущие влагозапасы',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'water_balance',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'water_demand_mm',
    label: 'Потребность во влаге',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'water_balance',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'temperature_daily_c',
    label: 'Температура за сутки',
    unit: '°C',
    valueKind: 'min_mean_max',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'potential_evapotranspiration_daily_mm',
    label: 'Суточная потенциальная испаряемость',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'relative_humidity_mean_pct',
    label: 'Влажность воздуха',
    unit: '%',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'wind_speed_2m_mean_mps',
    label: 'Скорость ветра',
    unit: 'м/с',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'weather',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'temperature_sum_from_sowing_c',
    label: 'Сумма температур от даты сева',
    unit: '°C',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'plant',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'actual_evapotranspiration_sum_mm',
    label: 'Фактическое суммарное испарение',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'line',
    group: 'plant',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'precipitation_mm',
    label: 'Осадки',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'bar',
    group: 'weather',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'actual_irrigation_mm',
    label: 'Фактический полив',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'bar',
    group: 'irrigation',
    isDefaultVisible: false,
    isEnabled: true
  },
  {
    code: 'recommended_irrigation_mm',
    label: 'Рекомендованный полив',
    unit: 'мм',
    valueKind: 'scalar',
    chartKind: 'bar',
    group: 'irrigation',
    isDefaultVisible: false,
    isEnabled: true
  }
];

export function getMetricDefinition(code: KornixMetricCode): KornixMetricDefinition {
  const definition = KORNIX_METRICS.find((metric) => metric.code === code);
  if (!definition) {
    throw new Error(`Unknown KORNIX metric: ${code}`);
  }
  return definition;
}
