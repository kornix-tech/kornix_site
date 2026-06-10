import { deriveWaterMetrics, deriveWaterThresholds } from '../features/water-regime/derivedWaterMetrics';
import type { FieldSeasonMapPropertiesDto } from '../types/kornix';
import { formatArea, formatNumber } from './format';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (symbol) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[symbol] ?? symbol;
  });
}

export function buildFieldTooltipHtml(field: FieldSeasonMapPropertiesDto): string {
  const derived = deriveWaterMetrics(field);
  const thresholds = deriveWaterThresholds(field);
  const dataQualityMessages = field.dataQuality?.messages ?? [];
  const messages = dataQualityMessages.length
    ? `<div class="tooltip-warning">${dataQualityMessages.map(escapeHtml).join('<br />')}</div>`
    : '';
  const fieldName = field.fieldName || field.fieldKey;
  const cropName = field.cropName ? escapeHtml(field.cropName) : 'культура не указана';
  const cropSowingDate = field.cropSowingDate ? escapeHtml(field.cropSowingDate) : 'не указана';

  return `
    <div class="field-tooltip">
      <strong>${escapeHtml(fieldName)}</strong>
      <div>${escapeHtml(field.fieldKey)} · ${formatArea(field.areaHa)}</div>
      <div>${cropName} · сев: ${cropSowingDate}</div>
      <hr />
      <div>День: ${escapeHtml(field.day)}</div>
      <div>Статус: ${escapeHtml(field.latestStatus)}</div>
      <div>Влагозапасы почвы: ${formatNumber(field.soil_water_content_mm)} мм</div>
      <div>Полная влагоёмкость: ${formatNumber(field.soil_total_capacity_water_mm)} мм</div>
      <div>НВ: ${formatNumber(field.soil_field_capacity_water_mm)} мм</div>
      <div>ВЗ: ${formatNumber(field.soil_wilting_point_capacity_water_mm)} мм</div>
      <div>AWC (НВ − ВЗ): ${formatNumber(derived.available_water_content_mm)} мм</div>
      <div>Текущий доступный запас: ${formatNumber(derived.current_available_water_mm)} мм</div>
      <div>% доступных влагозапасов: ${formatNumber(derived.available_water_fraction_pct, 0)}%</div>
      <div>Вода на конец дня: ${formatNumber(field.soil_water_end_mm)} мм</div>
      <div>Доступная вода FAO90: ${formatNumber(field.soil_water_available_mm)} мм</div>
      <div>% TAW: ${formatNumber(field.soil_water_available_pct_taw, 0)}%</div>
      <div>Корневая зона: ${formatNumber(field.root_zone_depth_m, 2)} м</div>
      <div>Водный стресс Ks: ${formatNumber(field.water_stress_coefficient, 2)}</div>
      <div>Фаза культуры: ${field.crop_stage_code ? escapeHtml(field.crop_stage_code) : 'нет данных'}</div>
      <div>Верхняя линия: ${formatNumber(thresholds.upper_limit_water_mm)} мм</div>
      <div>Оптимум: ${formatNumber(thresholds.optimum_water_mm)} мм</div>
      <div>Нижняя линия: ${formatNumber(thresholds.lower_limit_water_mm)} мм</div>
      <div>Осадки raw: ${formatNumber(field.precipitation_raw_daily_mm)} мм</div>
      <div>Эффективные осадки FAO90: ${formatNumber(field.effective_precipitation_daily_mm)} мм</div>
      <div>Эффективные осадки: ${formatNumber(field.precipitation_effective_daily_mm)} мм</div>
      <div>Полив raw: ${formatNumber(field.irrigation_raw_daily_mm)} мм</div>
      <div>Эффективный полив FAO90: ${formatNumber(field.effective_irrigation_daily_mm)} мм</div>
      <div>Эффективный полив: ${formatNumber(field.irrigation_effective_daily_mm)} мм</div>
      <div>Дренаж/сток: ${formatNumber(field.drainage_runoff_daily_mm)} мм</div>
      <div>Сумма температур: ${formatNumber(field.positive_temperature_sum_from_sowing_c)} °C</div>
      <div>Транспирация: ${formatNumber(field.crop_transpiration_daily_mm)} мм</div>
      <div>Рекомендация: ${
        field.recommended_irrigation_date
          ? `${escapeHtml(field.recommended_irrigation_date)} · ${formatNumber(field.recommended_irrigation_mm)} мм`
          : 'нет'
      }</div>
      ${messages}
    </div>
  `;
}
