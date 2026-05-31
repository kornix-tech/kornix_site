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
  const messages = field.dataQuality.messages.length
    ? `<div class="tooltip-warning">${field.dataQuality.messages.map(escapeHtml).join('<br />')}</div>`
    : '';
  const cropName = field.cropName ? escapeHtml(field.cropName) : 'культура не указана';
  const cropSowingDate = field.cropSowingDate ? escapeHtml(field.cropSowingDate) : 'не указана';

  return `
    <div class="field-tooltip">
      <strong>${escapeHtml(field.fieldName)}</strong>
      <div>${escapeHtml(field.fieldKey)} · ${formatArea(field.areaHa)}</div>
      <div>${cropName} · сев: ${cropSowingDate}</div>
      <hr />
      <div>День: ${escapeHtml(field.day)}</div>
      <div>Статус: ${escapeHtml(field.latestStatus)}</div>
      <div>Влагозапасы почвы: ${formatNumber(field.soil_water_content_mm)} мм</div>
      <div>Полная влагоёмкость: ${formatNumber(field.soil_total_capacity_water_mm)} мм</div>
      <div>НВ: ${formatNumber(field.soil_field_capacity_water_mm)} мм</div>
      <div>ВЗ: ${formatNumber(field.soil_wilting_point_capacity_water_mm)} мм</div>
      <div>AWC: ${formatNumber(derived.available_water_content_mm)} мм</div>
      <div>% доступных влагозапасов: ${formatNumber(derived.available_water_fraction_pct, 0)}%</div>
      <div>Верхняя линия: ${formatNumber(thresholds.upper_limit_water_mm)} мм</div>
      <div>Оптимум: ${formatNumber(thresholds.optimum_water_mm)} мм</div>
      <div>Нижняя линия: ${formatNumber(thresholds.lower_limit_water_mm)} мм</div>
      <div>Эффективные осадки: ${formatNumber(field.precipitation_effective_daily_mm)} мм</div>
      <div>Эффективный полив: ${formatNumber(field.irrigation_effective_daily_mm)} мм</div>
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
