import { deriveWaterMetrics } from '../features/water-regime/derivedWaterMetrics';
import type { FieldSeasonMapPropertiesDto } from '../types/kornix';
import { formatArea, formatNumber } from './format';

export type FieldRegulationRange = {
  min: number;
  max: number;
};

export type FieldTooltipSummary = {
  label: string;
  value: string;
  color: string;
};

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

function stripTenantPrefix(value: string): string {
  const withoutPrefix = value.replace(/^[A-Za-zА-Яа-яЁё0-9_]+:/, '').trim();
  return withoutPrefix || value;
}

function formatAvailablePercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'нет данных';
  }
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return formatNumber(percent, 0);
}

function formatSignedNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'нет данных';
  }
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

function formatRootZoneFieldCapacityPercent(field: FieldSeasonMapPropertiesDto): string {
  if (
    typeof field.soil_water_content_mm !== 'number' ||
    !Number.isFinite(field.soil_water_content_mm) ||
    typeof field.soil_field_capacity_water_mm !== 'number' ||
    !Number.isFinite(field.soil_field_capacity_water_mm) ||
    field.soil_field_capacity_water_mm <= 0
  ) {
    return 'нет данных';
  }
  return `${formatNumber((100 * field.soil_water_content_mm) / field.soil_field_capacity_water_mm, 0)}%`;
}

function formatIrrigationToRegulationBoundaries(
  field: FieldSeasonMapPropertiesDto,
  regulationRange: FieldRegulationRange
): { lower: string; upper: string } {
  if (
    typeof field.soil_water_content_mm !== 'number' ||
    !Number.isFinite(field.soil_water_content_mm) ||
    typeof field.soil_field_capacity_water_mm !== 'number' ||
    !Number.isFinite(field.soil_field_capacity_water_mm)
  ) {
    return { lower: 'нет данных', upper: 'нет данных' };
  }
  const lowerBoundaryMm = field.soil_field_capacity_water_mm * regulationRange.min;
  const upperBoundaryMm = field.soil_field_capacity_water_mm * regulationRange.max;
  return {
    lower: formatNumber(Math.max(0, lowerBoundaryMm - field.soil_water_content_mm)),
    upper: formatNumber(Math.max(0, upperBoundaryMm - field.soil_water_content_mm))
  };
}

function formatWeeklyIrrigationToRegulationBoundaries(
  field: FieldSeasonMapPropertiesDto,
  regulationRange: FieldRegulationRange
): { lower: string; upper: string } {
  const forecastSoilWater = field.forecastSevenDaySoilWaterContentMm;
  const forecastFieldCapacity = field.forecastSevenDayFieldCapacityWaterMm ?? field.soil_field_capacity_water_mm;
  if (
    typeof forecastSoilWater !== 'number' ||
    !Number.isFinite(forecastSoilWater) ||
    typeof forecastFieldCapacity !== 'number' ||
    !Number.isFinite(forecastFieldCapacity)
  ) {
    return { lower: 'нет данных', upper: 'нет данных' };
  }
  const lowerBoundaryMm = forecastFieldCapacity * regulationRange.min;
  const upperBoundaryMm = forecastFieldCapacity * regulationRange.max;
  return {
    lower: formatNumber(Math.max(0, lowerBoundaryMm - forecastSoilWater)),
    upper: formatNumber(Math.max(0, upperBoundaryMm - forecastSoilWater))
  };
}

function formatCardDate(value: string | null | undefined): string {
  if (!value) {
    return 'не указана';
  }
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!isoDate) {
    return value;
  }
  return `${isoDate[3]}.${isoDate[2]}.${isoDate[1].slice(2)}`;
}

function addDaysIso(day: string | null | undefined, days: number): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null;
  }
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildCompactTooltipLines(field: FieldSeasonMapPropertiesDto, regulationRange: FieldRegulationRange): string[] {
  const derived = deriveWaterMetrics(field);
  const fieldName = field.fieldDisplayName || stripTenantPrefix(field.fieldName || field.fieldKey);
  const cropName = field.cropName || 'сорт не указан';
  const sowingDate = formatCardDate(field.cropSowingDate);
  const productiveWaterRange = field.total_available_water_mm ?? derived.available_water_content_mm;
  const actualProductiveWater = field.soil_water_available_mm ?? derived.current_available_water_mm;
  const availablePercent = field.soil_water_available_pct_taw ?? derived.available_water_fraction_pct;
  const irrigationToRegulationBoundaries = formatIrrigationToRegulationBoundaries(field, regulationRange);
  const weeklyIrrigationToRegulationBoundaries = formatWeeklyIrrigationToRegulationBoundaries(field, regulationRange);
  const forecastSevenDayDate = field.forecastSevenDayDate ?? addDaysIso(field.day, 7);
  const forecastSevenDayDeficit =
    typeof field.forecastSevenDayEvapotranspirationSumMm === 'number' &&
    Number.isFinite(field.forecastSevenDayEvapotranspirationSumMm) &&
    typeof field.forecastSevenDayPrecipitationSumMm === 'number' &&
    Number.isFinite(field.forecastSevenDayPrecipitationSumMm)
      ? field.forecastSevenDayEvapotranspirationSumMm - field.forecastSevenDayPrecipitationSumMm
      : null;

  return [
    `${fieldName} - ${formatArea(field.areaHa)} - ${cropName} - посадка ${sowingDate}`,
    formatCardDate(field.day),
    `Диапазон продуктивных влагозапасов ${formatNumber(productiveWaterRange)} мм в расчетном слое ${formatNumber(
      field.root_zone_depth_m,
      2
    )} м`,
    `Фактические продуктивные влагозапасы ${formatNumber(actualProductiveWater)} мм (${formatAvailablePercent(
      availablePercent
    )}% доступных)`,
    `Влажность корнеобитаемого слоя ${formatRootZoneFieldCapacityPercent(field)} НВ`,
    `Полив до нижней границы регулирования ${irrigationToRegulationBoundaries.lower} мм, до верхней ${irrigationToRegulationBoundaries.upper} мм`,
    `${formatCardDate(forecastSevenDayDate)} (прогноз на семь дней)`,
    `Суммарное испарение ${formatNumber(
      field.forecastSevenDayEvapotranspirationSumMm
    )} мм, сумма осадков ${formatNumber(
      field.forecastSevenDayPrecipitationSumMm
    )} мм, дефицит ${formatSignedNumber(forecastSevenDayDeficit)} мм`,
    `Рекомендованный полив за неделю до нижней границы ${weeklyIrrigationToRegulationBoundaries.lower} мм, до верхней ${weeklyIrrigationToRegulationBoundaries.upper} мм`
  ];
}

export function buildFieldTooltipHtml(
  field: FieldSeasonMapPropertiesDto,
  regulationRange: FieldRegulationRange,
  summary?: FieldTooltipSummary | null
): string {
  const dataQualityMessages = field.dataQuality?.messages ?? [];
  const messages = dataQualityMessages.length
    ? `<div class="tooltip-warning">${dataQualityMessages.map(escapeHtml).join('<br />')}</div>`
    : '';
  const popupLines = buildCompactTooltipLines(field, regulationRange);
  const [titleLine, ...detailLines] = popupLines;
  const currentDayLines = detailLines.slice(0, 5);
  const forecastLines = detailLines.slice(5);

  return `
    <div class="field-tooltip">
      ${
        summary
          ? `<div class="field-tooltip-map-summary">
              <strong>${escapeHtml(summary.label)}</strong>
              <span style="color: ${escapeHtml(summary.color)}">${escapeHtml(summary.value)}</span>
            </div>`
          : ''
      }
      <div class="field-tooltip-current">
        <strong>${escapeHtml(titleLine ?? '')}</strong>
        ${currentDayLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      </div>
      <div class="field-tooltip-forecast">
        ${forecastLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      </div>
      ${messages}
    </div>
  `;
}
