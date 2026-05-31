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
  const messages = field.dataQuality.messages.length
    ? `<div class="tooltip-warning">${field.dataQuality.messages.map(escapeHtml).join('<br />')}</div>`
    : '';
  const cropName = field.cropName ? escapeHtml(field.cropName) : 'культура не указана';
  const latestWaterRegimeDay = field.latestWaterRegimeDay
    ? escapeHtml(field.latestWaterRegimeDay)
    : 'нет расчёта';

  return `
    <div class="field-tooltip">
      <strong>${escapeHtml(field.fieldName)}</strong>
      <div>${escapeHtml(field.fieldKey)} · ${formatArea(field.areaHa)}</div>
      <div>${cropName}</div>
      <hr />
      <div>День: ${latestWaterRegimeDay}</div>
      <div>% доступных влагозапасов: ${formatNumber(field.currentWaterPercent, 0)}%</div>
      <div>Текущая вода: ${formatNumber(field.currentWaterMm)} мм</div>
      <div>Доступная вода: ${formatNumber(field.availableWaterMm)} мм</div>
      <div>Потребность: ${formatNumber(field.waterDemandMm)} мм</div>
      <div>Осадки: ${formatNumber(field.precipitationMm)} мм</div>
      <div>Факт полива: ${formatNumber(field.actualIrrigationMm)} мм</div>
      <div>Рекомендация модели: ${formatNumber(field.recommendedIrrigationMm)} мм</div>
      ${messages}
    </div>
  `;
}
