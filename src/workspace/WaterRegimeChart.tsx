import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { kornixApi } from '../api/kornixApi';
import { getMetricDefinition, REQUIRED_FAO90_METRIC_CODES } from '../config/metrics';
import type {
  FieldSeasonMapFeature,
  KornixMetricSeriesDto,
  MetricScalarValue,
  KornixProfileTimeseriesDto,
  RequiredBackendMetricLongName
} from '../types/kornix';
import { ExportActions } from './ExportActions';
import { buildCsv, downloadPagePng } from './exportUtils';
import { visibleUserWarnings } from './warningPresentation';

type ProfileRow = {
  day: string;
  xIndex: number;
  temperature: number | null;
  temperatureFact: number | null;
  temperatureForecast: number | null;
  humidity: number | null;
  humidityFact: number | null;
  humidityForecast: number | null;
  wind: number | null;
  windFact: number | null;
  windForecast: number | null;
  potentialEvaporationDaily: number | null;
  potentialEvaporationDailyFact: number | null;
  potentialEvaporationDailyForecast: number | null;
  shortwaveRadiationDaily: number | null;
  shortwaveRadiationDailyFact: number | null;
  shortwaveRadiationDailyForecast: number | null;
  temperatureSum: number | null;
  temperatureSumFact: number | null;
  temperatureSumForecast: number | null;
  actualEvapotranspirationDaily: number | null;
  actualEvapotranspirationDailyFact: number | null;
  actualEvapotranspirationDailyForecast: number | null;
  actualSoilEvaporationDaily: number | null;
  actualSoilEvaporationDailyFact: number | null;
  actualSoilEvaporationDailyForecast: number | null;
  actualTranspirationDaily: number | null;
  actualTranspirationDailyFact: number | null;
  actualTranspirationDailyForecast: number | null;
  availableRange: [number, number] | null;
  availableRangeFact: [number, number] | null;
  availableRangeForecast: [number, number] | null;
  availableLower: number | null;
  availableUpper: number | null;
  fieldCapacity: number | null;
  wiltingPoint: number | null;
  currentWater: number | null;
  currentWaterFact: number | null;
  currentWaterForecast: number | null;
  precipitation: number | null;
  precipitationFact: number | null;
  precipitationForecast: number | null;
  irrigation: number | null;
  irrigationFact: number | null;
  irrigationForecast: number | null;
};

type ChartZoneId = 'weather' | 'plant' | 'water' | 'precipitation';

const LEGEND_ITEMS = [
  { label: 'Температура воздуха', color: '#d85b2a', kind: 'line' },
  { label: 'Влажность воздуха', color: '#2a9d8f', kind: 'line' },
  { label: 'Скорость ветра', color: '#7b61ff', kind: 'dash' },
  { label: 'ETo', color: '#a75515', kind: 'dash' },
  { label: 'Солнечная радиация', color: '#c28b00', kind: 'dash' },
  { label: 'Сумма температур', color: '#f08c00', kind: 'line' },
  { label: 'Фактическая ET', color: '#1f6f78', kind: 'line' },
  { label: 'Испарение почвы', color: '#9a7b2f', kind: 'dash' },
  { label: 'Транспирация культуры', color: '#4c956c', kind: 'line' },
  { label: 'Полная влагоёмкость', color: '#123b73', kind: 'dash' },
  { label: 'Диапазон управления', color: '#91c86a', kind: 'area' },
  { label: 'Влагозапасы почвы', color: '#1f7a3a', kind: 'line' },
  { label: 'Эффективные осадки', color: '#68c5f4', kind: 'bar' },
  { label: 'Эффективный полив', color: '#2f6fd6', kind: 'bar' }
];

const CHART_MARGIN = {
  top: 18,
  right: 8,
  left: 10,
  bottom: 0
};

const LEFT_AXIS_WIDTH = 34;
const RIGHT_AXIS_HUMIDITY_WIDTH = 28;
const RIGHT_AXIS_WIND_WIDTH = 28;
const RIGHT_AXIS_EVAPORATION_WIDTH = 28;
const RIGHT_AXIS_SHORTWAVE_WIDTH = 32;
const RIGHT_AXIS_TOTAL_WIDTH =
  RIGHT_AXIS_HUMIDITY_WIDTH + RIGHT_AXIS_WIND_WIDTH + RIGHT_AXIS_EVAPORATION_WIDTH + RIGHT_AXIS_SHORTWAVE_WIDTH;

const BOTTOM_CHART_MARGIN = {
  ...CHART_MARGIN,
  bottom: 0
};

function tooltipDateLabel(label: unknown, payload?: ReadonlyArray<{ payload?: ProfileRow }>): string {
  return payload?.[0]?.payload?.day ?? String(label);
}

function tooltipValueFormatter(value: unknown, name: unknown): [string, string] {
  const label = String(name);
  const numericValue = Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : typeof value === 'number' && Number.isFinite(value)
      ? [value]
      : [];

  if (!numericValue.length) {
    return ['нет данных', label];
  }

  if (Array.isArray(value) && label.includes('Доступные влагозапасы')) {
    const difference = Math.max(0, numericValue[numericValue.length - 1] - numericValue[0]);
    return [`${Math.round(difference)} мм`, 'Доступные влагозапасы'];
  }

  if (
    label.includes('влагозапас') ||
    label.includes('влагоёмкость') ||
    label.includes('насыщение') ||
    label.includes('Оптимум')
  ) {
    return [`${Math.round(numericValue[0])} мм`, label];
  }

  if (label.includes('Сумма температур')) {
    return [`${Math.round(numericValue[0])} °C`, label];
  }

  return [`${Number(numericValue[0].toFixed(1))}`, label];
}

const CHART_TOOLTIP_PROPS = {
  allowEscapeViewBox: { x: true, y: true },
  wrapperStyle: {
    zIndex: 30,
    outline: 'none'
  },
  contentStyle: {
    padding: '5px 7px',
    borderColor: 'rgba(23, 65, 38, 0.16)',
    borderRadius: 6,
    boxShadow: '0 8px 18px rgb(14 44 27 / 12%)',
    fontSize: 10,
    lineHeight: 1.12
  },
  labelStyle: {
    marginBottom: 3,
    color: '#43513f',
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1.1
  },
  itemStyle: {
    padding: 0,
    fontSize: 10,
    lineHeight: 1.12
  },
  labelFormatter: tooltipDateLabel,
  formatter: tooltipValueFormatter
};

function localDateIso(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysIso(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return localDateIso(date);
}

function maxDateIso(left: string, right: string): string {
  return left > right ? left : right;
}

function dayDiff(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.round((end - start) / 86_400_000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatDateLabel(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

function formatDateShortLabel(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year.slice(-2)}`;
}

function monthLabel(day: string): string {
  const [year, month] = day.split('-');
  return `${month}.${year}`;
}

function monthStartIso(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function shiftMonthIso(day: string, offset: number): string {
  const date = new Date(`${monthStartIso(day)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return localDateIso(date);
}

function daysInMonth(day: string): string[] {
  const cursor = new Date(`${monthStartIso(day)}T00:00:00Z`);
  const month = cursor.getUTCMonth();
  const days: string[] = [];
  while (cursor.getUTCMonth() === month) {
    days.push(localDateIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function mondayOffset(day: string): number {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function CompactDateInput({
  value,
  ariaLabel,
  align = 'start',
  onChange
}: {
  value: string;
  ariaLabel: string;
  align?: 'start' | 'end';
  onChange: (day: string) => void;
}) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(monthStartIso(value));
  const monthDays = useMemo(() => daysInMonth(visibleMonth), [visibleMonth]);
  const leadingEmptyDays = mondayOffset(monthDays[0] ?? visibleMonth);

  useEffect(() => {
    if (!isOpen) {
      setVisibleMonth(monthStartIso(value));
    }
  }, [isOpen, value]);

  return (
    <span
      ref={wrapperRef}
      className={`compact-date-picker-wrap compact-date-picker-${align}`}
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="compact-date-picker"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span aria-hidden="true">{formatDateShortLabel(value)}</span>
      </button>
      {isOpen && (
        <div className="compact-calendar" role="dialog" aria-label={ariaLabel}>
          <div className="compact-calendar-header">
            <button type="button" onClick={() => setVisibleMonth((month) => shiftMonthIso(month, -1))}>
              ‹
            </button>
            <strong>{monthLabel(visibleMonth)}</strong>
            <button type="button" onClick={() => setVisibleMonth((month) => shiftMonthIso(month, 1))}>
              ›
            </button>
          </div>
          <div className="compact-calendar-grid compact-calendar-weekdays" aria-hidden="true">
            {['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map((dayName, index) => (
              <span key={`${dayName}-${index}`}>{dayName}</span>
            ))}
          </div>
          <div className="compact-calendar-grid">
            {Array.from({ length: leadingEmptyDays }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {monthDays.map((day) => (
              <button
                key={day}
                type="button"
                className={day === value ? 'compact-calendar-selected' : ''}
                onClick={() => {
                  onChange(day);
                  setIsOpen(false);
                }}
              >
                {day.slice(-2)}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

function findSeries(
  profile: KornixProfileTimeseriesDto,
  code: RequiredBackendMetricLongName
): KornixMetricSeriesDto | undefined {
  return profile.metrics.find((series) => series.long_name_for_code === code);
}

function scalarValue(series: KornixMetricSeriesDto | undefined, day: string): number | null {
  if (!series || series.valueKind !== 'scalar') {
    return null;
  }

  const value = series.points.find((point) => point.day === day)?.value ?? null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstFiniteValue(...values: Array<number | null>): number | null {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? null;
}

function sumRequiredFiniteValues(...values: Array<number | null>): number | null {
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    return null;
  }
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

function scalarRawValue(series: KornixMetricSeriesDto | undefined, day: string): MetricScalarValue {
  if (!series || series.valueKind !== 'scalar') {
    return null;
  }
  return series.points.find((point) => point.day === day)?.value ?? null;
}

function meanValue(series: KornixMetricSeriesDto | undefined, day: string): number | null {
  if (!series || (series.valueKind !== 'min_mean_max' && series.valueKind !== 'mean_max_gust')) {
    return null;
  }

  return series.points.find((point) => point.day === day)?.mean ?? null;
}

function splitForecastValue<T>(
  day: string,
  forecastStart: string,
  value: T | null
): [T | null, T | null] {
  return [day < forecastStart ? value : null, day >= forecastStart ? value : null];
}

function buildProfileRows(profile: KornixProfileTimeseriesDto, forecastStart: string): ProfileRow[] {
  const days = Array.from(
    new Set(profile.metrics.flatMap((metric) => metric.points.map((point) => point.day)))
  ).sort();
  const series = (code: RequiredBackendMetricLongName) => findSeries(profile, code);

  return days.map((day, xIndex) => {
    const temperature = meanValue(series('air_temperature_daily_c'), day);
    const humidity = meanValue(series('relative_humidity_daily_pct'), day);
    const wind = meanValue(series('wind_daily_mps'), day);
    const potentialEvaporationDaily = scalarValue(series('eto_daily_mm'), day);
    const shortwaveRadiationDaily = scalarValue(series('shortwave_radiation_daily_mj_m2'), day);
    const temperatureSum = scalarValue(series('positive_temperature_sum_from_sowing_c'), day);
    const actualEvapotranspirationRaw = scalarValue(series('actual_evapotranspiration_mm'), day);
    const legacyDailyWaterUse = scalarValue(series('crop_transpiration_daily_mm'), day);
    const actualTranspirationRaw = scalarValue(series('actual_transpiration_mm'), day);
    const soilEvaporationRaw = scalarValue(series('actual_soil_evaporation_mm'), day);
    const evapotranspirationSource = firstFiniteValue(actualEvapotranspirationRaw, legacyDailyWaterUse);
    const actualTranspirationDaily = firstFiniteValue(
      actualTranspirationRaw,
      evapotranspirationSource !== null && soilEvaporationRaw !== null
        ? Math.max(0, evapotranspirationSource - soilEvaporationRaw)
        : null,
      evapotranspirationSource !== null ? 0 : null
    );
    const soilEvaporationDaily = firstFiniteValue(
      soilEvaporationRaw,
      evapotranspirationSource !== null && actualTranspirationRaw !== null
        ? Math.max(0, evapotranspirationSource - actualTranspirationRaw)
        : null,
      evapotranspirationSource !== null ? evapotranspirationSource : null
    );
    const actualEvapotranspirationFromComponents = sumRequiredFiniteValues(
      actualTranspirationDaily,
      soilEvaporationDaily
    );
    const actualEvapotranspirationDaily = firstFiniteValue(
      actualEvapotranspirationFromComponents,
      evapotranspirationSource
    );
    const fieldCapacity = scalarValue(series('soil_field_capacity_water_mm'), day);
    const wiltingPoint = scalarValue(series('soil_wilting_point_capacity_water_mm'), day);
    const currentWater = scalarValue(series('soil_water_end_mm'), day);
    const range: [number, number] | null =
      fieldCapacity !== null ? [fieldCapacity * 0.6, fieldCapacity * 0.9] : null;
    const precipitation = scalarValue(series('precipitation_effective_daily_mm'), day);
    const irrigation = scalarValue(series('irrigation_effective_daily_mm'), day);
    const [temperatureFact, temperatureForecast] = splitForecastValue(day, forecastStart, temperature);
    const [humidityFact, humidityForecast] = splitForecastValue(day, forecastStart, humidity);
    const [windFact, windForecast] = splitForecastValue(day, forecastStart, wind);
    const [potentialEvaporationDailyFact, potentialEvaporationDailyForecast] = splitForecastValue(
      day,
      forecastStart,
      potentialEvaporationDaily
    );
    const [shortwaveRadiationDailyFact, shortwaveRadiationDailyForecast] = splitForecastValue(
      day,
      forecastStart,
      shortwaveRadiationDaily
    );
    const [temperatureSumFact, temperatureSumForecast] = splitForecastValue(day, forecastStart, temperatureSum);
    const [actualEvapotranspirationDailyFact, actualEvapotranspirationDailyForecast] = splitForecastValue(
      day,
      forecastStart,
      actualEvapotranspirationDaily
    );
    const [actualSoilEvaporationDailyFact, actualSoilEvaporationDailyForecast] = splitForecastValue(
      day,
      forecastStart,
      soilEvaporationDaily
    );
    const [actualTranspirationDailyFact, actualTranspirationDailyForecast] = splitForecastValue(
      day,
      forecastStart,
      actualTranspirationDaily
    );
    const [availableRangeFact, availableRangeForecast] = splitForecastValue(day, forecastStart, range);
    const [currentWaterFact, currentWaterForecast] = splitForecastValue(day, forecastStart, currentWater);
    const [precipitationFact, precipitationForecast] = splitForecastValue(day, forecastStart, precipitation);
    const [irrigationFact, irrigationForecast] = splitForecastValue(day, forecastStart, irrigation);

    return {
      day,
      xIndex,
      temperature,
      temperatureFact,
      temperatureForecast,
      humidity,
      humidityFact,
      humidityForecast,
      wind,
      windFact,
      windForecast,
      potentialEvaporationDaily,
      potentialEvaporationDailyFact,
      potentialEvaporationDailyForecast,
      shortwaveRadiationDaily,
      shortwaveRadiationDailyFact,
      shortwaveRadiationDailyForecast,
      temperatureSum,
      temperatureSumFact,
      temperatureSumForecast,
      actualEvapotranspirationDaily,
      actualEvapotranspirationDailyFact,
      actualEvapotranspirationDailyForecast,
      actualSoilEvaporationDaily: soilEvaporationDaily,
      actualSoilEvaporationDailyFact,
      actualSoilEvaporationDailyForecast,
      actualTranspirationDaily,
      actualTranspirationDailyFact,
      actualTranspirationDailyForecast,
      availableRange: range,
      availableRangeFact,
      availableRangeForecast,
      availableLower: range?.[0] ?? null,
      availableUpper: range?.[1] ?? null,
      fieldCapacity,
      wiltingPoint,
      currentWater,
      currentWaterFact,
      currentWaterForecast,
      precipitation,
      precipitationFact,
      precipitationForecast,
      irrigation,
      irrigationFact,
      irrigationForecast
    };
  });
}

function fieldCapacityMm(rows: ProfileRow[]): number | null {
  const fieldCapacityValues = rows
    .map((row) => row.fieldCapacity)
    .filter((value): value is number => typeof value === 'number');

  if (!fieldCapacityValues.length) {
    return null;
  }

  return Math.ceil(Math.max(...fieldCapacityValues));
}

function wiltingPointMm(rows: ProfileRow[]): number | null {
  const wiltingPointValues = rows
    .map((row) => row.wiltingPoint)
    .filter((value): value is number => typeof value === 'number');

  if (!wiltingPointValues.length) {
    return null;
  }

  return Math.ceil(Math.max(...wiltingPointValues));
}

function waterReserveDomain(rows: ProfileRow[], fieldCapacity: number | null): [number, number | string] {
  const waterValues = rows
    .flatMap((row) => [row.availableLower, row.availableUpper, row.fieldCapacity, row.wiltingPoint, row.currentWater])
    .filter((value): value is number => typeof value === 'number');

  if (!waterValues.length) {
    return [0, 'dataMax + 20'];
  }

  const visibleMinimum = Math.max(0, Math.floor(Math.min(...waterValues) * 0.5));
  const visibleMaximum = fieldCapacity === null ? 'dataMax + 20' : fieldCapacity;

  return [visibleMinimum, visibleMaximum];
}

function serializeMetricValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

function metricCsvColumns(metric: KornixMetricSeriesDto): string[] {
  if (metric.valueKind === 'min_mean_max') {
    return [`${metric.long_name_for_code}_min`, `${metric.long_name_for_code}_mean`, `${metric.long_name_for_code}_max`];
  }
  if (metric.valueKind === 'mean_max_gust') {
    return [`${metric.long_name_for_code}_mean`, `${metric.long_name_for_code}_max_gust`];
  }
  return [metric.long_name_for_code];
}

function metricCsvValues(metric: KornixMetricSeriesDto, day: string): Array<string | number | boolean | null> {
  const point = metric.points.find((item) => item.day === day);
  if (!point) {
    return metricCsvColumns(metric).map(() => null);
  }
  if (metric.valueKind === 'min_mean_max') {
    return [
      'min' in point ? point.min : null,
      'mean' in point ? point.mean : null,
      'max' in point ? point.max : null
    ];
  }
  if (metric.valueKind === 'mean_max_gust') {
    return [
      'mean' in point ? point.mean : null,
      'maxGust' in point ? point.maxGust : null
    ];
  }
  return [serializeMetricValue('value' in point ? point.value : null)];
}

function buildProfileCsv(
  profile: KornixProfileTimeseriesDto,
  rows: ProfileRow[],
  forecastStart: string,
  methodCode: string,
  methodLabel: string
): string {
  const metricColumns = profile.metrics.flatMap(metricCsvColumns);
  return buildCsv([
    [
      'day',
      'method_code',
      'method_label',
      'period',
      ...metricColumns
    ],
    ...rows.map((row) => [
      row.day,
      methodCode,
      methodLabel,
      row.day >= forecastStart ? 'forecast' : 'fact',
      ...profile.metrics.flatMap((metric) => metricCsvValues(metric, row.day))
    ])
  ]);
}

export function WaterRegimeChart({
  calculationRunId,
  methodCode,
  methodLabel,
  fields,
  fieldSeasonIds,
  from,
  to,
  serverDate,
  forecastStartDate,
  forecastEndDate,
  onFromChange,
  onToChange,
  onCsvChange,
  onExportData
}: {
  calculationRunId: string | null;
  methodCode: string | null;
  methodLabel: string;
  fields: FieldSeasonMapFeature[];
  fieldSeasonIds: string[];
  from: string;
  to: string;
  serverDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onCsvChange: (csv: string | null) => void;
  onExportData: () => void;
}) {
  const profileQuery = useQuery({
    queryKey: ['water-regime-profile', calculationRunId, methodCode, fieldSeasonIds.join(',')],
    enabled: Boolean(calculationRunId && methodCode) && fieldSeasonIds.length > 0,
    queryFn: () =>
      kornixApi.getProfileTimeseries({
        calculationRunId: calculationRunId ?? '',
        methodCode: methodCode ?? '',
        fieldSeasonIds,
        aggregation: fieldSeasonIds.length > 1 ? 'area_weighted_mean' : undefined
      })
  });

  const isLoading = profileQuery.isLoading;
  const isError = profileQuery.isError;
  const forecastStart = profileQuery.data?.forecastStartDate ?? forecastStartDate;
  const forecastEnd = profileQuery.data?.forecastEndDate ?? forecastEndDate;

  useEffect(() => {
  if (!calculationRunId || !methodCode || fieldSeasonIds.length === 0 || isLoading || isError) {
      onCsvChange(null);
    }
  }, [calculationRunId, methodCode, fieldSeasonIds.length, isError, isLoading, onCsvChange]);

  return (
    <section className="chart-panel">
      {fieldSeasonIds.length === 0 && (
        <div className="empty-state">Выберите одно или несколько полей слева.</div>
      )}
      {!calculationRunId && <div className="empty-state">Нет расчёта. Утвердите поливы.</div>}
      {calculationRunId && !methodCode && <div className="empty-state">Backend не вернул метод расчёта.</div>}

      {isLoading && <div className="empty-state">Загрузка графика…</div>}
      {isError && <div className="error-state">Не удалось загрузить временной ряд.</div>}
      {calculationRunId && fieldSeasonIds.length > 0 && !isLoading && !isError && profileQuery.data && (
        <ChartBody
          profile={profileQuery.data}
          fields={fields}
          forecastStart={forecastStart}
          forecastEnd={forecastEnd}
          serverDate={profileQuery.data.serverDate ?? serverDate}
          from={from}
          selectedCount={fieldSeasonIds.length}
          methodCode={methodCode ?? profileQuery.data.methodCode ?? ''}
          methodLabel={methodLabel}
          to={to}
          onFromChange={onFromChange}
          onToChange={onToChange}
          onCsvChange={onCsvChange}
          onExportData={onExportData}
        />
      )}
    </section>
  );
}

function ChartBody({
  profile,
  fields,
  forecastStart,
  forecastEnd,
  serverDate,
  from,
  selectedCount,
  methodCode,
  methodLabel,
  to,
  onFromChange,
  onToChange,
  onCsvChange,
  onExportData
}: {
  profile: KornixProfileTimeseriesDto;
  fields: FieldSeasonMapFeature[];
  forecastStart: string;
  forecastEnd: string;
  serverDate: string;
  from: string;
  selectedCount: number;
  methodCode: string;
  methodLabel: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onCsvChange: (csv: string | null) => void;
  onExportData: () => void;
}) {
  const chartGraphicsRef = useRef<HTMLDivElement | null>(null);
  const allRows = useMemo(
    () => buildProfileRows(profile, forecastStart),
    [forecastStart, profile]
  );
  const rows = useMemo(() => {
    const filteredRows = allRows.filter((row) => row.day >= from && row.day <= to);
    return filteredRows.length > 0 ? filteredRows : allRows;
  }, [allRows, from, to]);
  const firstDay = allRows[0]?.day ?? from;
  const lastDay = allRows.length > 0 ? allRows[allRows.length - 1].day : to;
  const viewFirstDay = rows[0]?.day ?? firstDay;
  const viewLastDay = rows.length > 0 ? rows[rows.length - 1].day : lastDay;
  const [selectedDay, setSelectedDay] = useState(serverDate);
  const selectedDayInRange = addDaysIso(
    viewFirstDay,
    clamp(dayDiff(viewFirstDay, selectedDay), 0, dayDiff(viewFirstDay, viewLastDay))
  );
  const fieldCapacity = fieldCapacityMm(rows);
  const wiltingPoint = wiltingPointMm(rows);
  const aggregation = profile.aggregation;
  const singleSelectedField =
    selectedCount === 1
      ? fields.find((field) => field.properties.fieldSeasonId === profile.selectedFieldSeasonIds[0])
      : undefined;
  const singleSelectedFieldLabel = singleSelectedField
    ? [
        singleSelectedField.properties.fieldKey,
        singleSelectedField.properties.cropName ?? singleSelectedField.properties.fieldName
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  const profileCsv = buildProfileCsv(profile, rows, forecastStart, methodCode, methodLabel);
  const metricCodes = useMemo(
    () => new Set(profile.metrics.map((metric) => metric.long_name_for_code)),
    [profile.metrics]
  );
  const missingRequiredMetrics = useMemo(
    () => REQUIRED_FAO90_METRIC_CODES.filter((code) => !metricCodes.has(code)),
    [metricCodes]
  );
  const selectedDiagnosticsDay = useMemo(
    () => closestProfileDayWithDiagnostics(profile, selectedDayInRange, rows.map((row) => row.day)),
    [profile, rows, selectedDayInRange]
  );
  const selectedDayDiagnostics = useMemo(
    () => buildSelectedDayDiagnostics(profile, selectedDiagnosticsDay),
    [profile, selectedDiagnosticsDay]
  );
  const userWarnings = visibleUserWarnings(profile.warnings);

  useEffect(() => {
    onCsvChange(profileCsv);
  }, [onCsvChange, profileCsv]);

  useEffect(() => {
    setSelectedDay((current) =>
      addDaysIso(viewFirstDay, clamp(dayDiff(viewFirstDay, current), 0, dayDiff(viewFirstDay, viewLastDay)))
    );
  }, [viewFirstDay, viewLastDay]);

  async function handleExportGraphics() {
    if (!chartGraphicsRef.current) {
      return;
    }

    await downloadPagePng(chartGraphicsRef.current, `kornix-water-regime-${from}-${to}`);
  }

  return (
    <div className="chart-workbench">
      <div ref={chartGraphicsRef} className="chart-box">
        <CompositeProfileChart
          rows={rows}
          fieldCapacity={fieldCapacity}
          wiltingPoint={wiltingPoint}
          forecastStart={forecastStart}
          selectedDay={selectedDayInRange}
        />
        <ChartTimeZoom
          from={firstDay}
          to={lastDay}
          viewFrom={viewFirstDay}
          viewTo={viewLastDay}
          forecastStart={forecastStart}
          onFromChange={onFromChange}
          onToChange={onToChange}
          onChange={setSelectedDay}
        />
      </div>
      <aside className="chart-side-panel">
        <div className="chart-date-controls">
          <label aria-label="Начало видимого периода графика">
            <CompactDateInput
              value={from}
              ariaLabel="Начало видимого периода графика"
              onChange={onFromChange}
            />
          </label>
          <span className="chart-date-separator" aria-hidden="true">—</span>
          <label aria-label="Конец видимого периода графика">
            <CompactDateInput
              value={to}
              ariaLabel="Конец видимого периода графика"
              align="end"
              onChange={onToChange}
            />
          </label>
        </div>

        <div className="chart-caption">
          <strong>Водный режим</strong>
          <span>{methodLabel}</span>
          {aggregation && (
            <span>
              {aggregation.selectedFieldCount} полей · {aggregation.totalAreaHa.toFixed(1)} га
            </span>
          )}
          {!aggregation && selectedCount === 1 && <span>{singleSelectedFieldLabel ?? 'одно поле'}</span>}
        </div>

        <div className="chart-caption chart-caption-muted">
          Прогноз: {forecastStart} — {forecastEnd}
        </div>

        <Fao90MetricSummary
          metricCount={profile.metrics.length}
          missingRequiredMetrics={missingRequiredMetrics}
          selectedDay={selectedDiagnosticsDay}
          diagnostics={selectedDayDiagnostics}
        />

        {userWarnings.length > 0 && (
          <div className="diagnostic-warning-list" aria-label="Предупреждения графика">
            {userWarnings.map((warning) => (
              <span key={`${warning.code}-${warning.message}`}>
                <strong>{warning.code}</strong>: {warning.message}
              </span>
            ))}
          </div>
        )}

        <LegendStrip />

        <ExportActions onExportGraphics={handleExportGraphics} onExportData={onExportData} dataDisabled={!profileCsv} />
      </aside>
    </div>
  );
}

function LegendStrip() {
  return (
    <div className="chart-legend" aria-label="Легенда комплексного графика">
      {LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="chart-legend-item">
          <span
            className={`legend-swatch legend-swatch-${item.kind}`}
            style={{ '--legend-color': item.color } as CSSProperties}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'нет данных';
  }
  if (typeof value === 'number') {
    return Number(value.toFixed(2)).toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? 'нет' : value.map((item) => formatDisplayValue(item)).join('; ');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return 'нет';
    }

    return entries
      .map(([key, entryValue]) => `${formatDiagnosticKey(key)}: ${formatDisplayValue(entryValue)}`)
      .join('\n');
  }
  return String(value);
}

function formatDiagnosticKey(key: string): string {
  const labels: Record<string, string> = {
    residual_mm: 'баланс',
    continuity_error_mm: 'непрерывность'
  };

  return labels[key] ?? key.replace(/_/g, ' ');
}

const DIAGNOSTICS_CODES: RequiredBackendMetricLongName[] = [
  'crop_stage_code',
  'days_after_sowing',
  'root_zone_depth_m',
  'water_stress_coefficient',
  'drainage_runoff_daily_mm',
  'calculation_diagnostics_json',
  'calculation_warnings_json'
];

function hasDiagnosticValue(value: MetricScalarValue): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

function diagnosticScore(profile: KornixProfileTimeseriesDto, day: string): number {
  return DIAGNOSTICS_CODES.reduce((score, code) => {
    return score + (hasDiagnosticValue(scalarRawValue(findSeries(profile, code), day)) ? 1 : 0);
  }, 0);
}

function closestProfileDayWithDiagnostics(
  profile: KornixProfileTimeseriesDto,
  targetDay: string,
  candidateDays: string[]
): string {
  const scoredDays = candidateDays
    .map((day) => ({
      day,
      score: diagnosticScore(profile, day),
      distance: Math.abs(dayDiff(targetDay, day))
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => left.distance - right.distance || right.day.localeCompare(left.day));

  return scoredDays[0]?.day ?? targetDay;
}

function buildSelectedDayDiagnostics(profile: KornixProfileTimeseriesDto, day: string) {
  return DIAGNOSTICS_CODES.map((code) => {
    const definition = getMetricDefinition(code);
    return {
      code,
      label: definition.label,
      value: scalarRawValue(findSeries(profile, code), day)
    };
  });
}

function Fao90MetricSummary({
  metricCount,
  missingRequiredMetrics,
  selectedDay,
  diagnostics
}: {
  metricCount: number;
  missingRequiredMetrics: RequiredBackendMetricLongName[];
  selectedDay: string;
  diagnostics: Array<{ code: RequiredBackendMetricLongName; label: string; value: MetricScalarValue }>;
}) {
  return (
    <div className="fao90-metric-summary" aria-label="FAO90 метрики профиля">
      <div className="fao90-metric-summary-header">
        <strong>FAO90 chain</strong>
        <span>{metricCount} метрик</span>
      </div>
      {missingRequiredMetrics.length === 0 ? (
        <span className="fao90-metric-pass">44/44 backend метрики доступны</span>
      ) : (
        <span className="fao90-metric-warning">
          Нет метрик: {missingRequiredMetrics.slice(0, 4).join(', ')}
          {missingRequiredMetrics.length > 4 ? ` +${missingRequiredMetrics.length - 4}` : ''}
        </span>
      )}
      <details>
        <summary>Фаза, stress и diagnostics за {formatDateShortLabel(selectedDay)}</summary>
        <dl>
          {diagnostics.map((item) => (
            <div
              key={item.code}
              className={item.code.endsWith('_json') ? 'fao90-metric-summary-json-row' : undefined}
            >
              <dt>{item.label}</dt>
              <dd>
                {formatDisplayValue(item.value)
                  .split('\n')
                  .map((line) => (
                    <span key={line}>{line}</span>
                  ))}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function ForecastBoundary({
  forecastX,
  label,
  yAxisId
}: {
  forecastX: number;
  label?: boolean;
  yAxisId?: string;
}) {
  return (
    <ReferenceLine
      yAxisId={yAxisId}
      x={forecastX}
      stroke="#d95f0b"
      strokeDasharray="4 4"
      strokeWidth={1.5}
      label={label ? { value: 'прогноз', position: 'insideTop', fill: '#b44e08', fontSize: 11 } : undefined}
    />
  );
}

function SelectedDayMarker({ selectedX, yAxisId }: { selectedX: number; yAxisId?: string }) {
  return (
    <ReferenceLine
      yAxisId={yAxisId}
      x={selectedX}
      stroke="#174126"
      strokeDasharray="2 4"
      strokeOpacity={0.72}
      strokeWidth={1.4}
    />
  );
}

function RightAxisReserve({ yAxisId, width }: { yAxisId: string; width: number }) {
  return (
    <YAxis
      yAxisId={yAxisId}
      orientation="right"
      width={width}
      tick={false}
      tickLine={false}
      axisLine={false}
    />
  );
}

function handleZoneKey(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function axisTickWithUnitAtZero(unit: string, labeledValue?: { value: number | null; label: string }) {
  return (value: unknown): string => {
    if (typeof value === 'number' && value === 0) {
      return unit;
    }
    if (
      typeof value === 'number' &&
      typeof labeledValue?.value === 'number' &&
      Math.abs(value - labeledValue.value) < 0.001
    ) {
      return labeledValue.label;
    }

    return String(value);
  };
}

function ChartTimeZoom({
  from,
  to,
  viewFrom,
  viewTo,
  forecastStart,
  onFromChange,
  onToChange,
  onChange
}: {
  from: string;
  to: string;
  viewFrom: string;
  viewTo: string;
  forecastStart: string;
  onFromChange: (day: string) => void;
  onToChange: (day: string) => void;
  onChange: (day: string) => void;
}) {
  const maxIndex = Math.max(0, dayDiff(from, to));
  const viewFromIndex = clamp(dayDiff(from, viewFrom), 0, maxIndex);
  const viewToIndex = clamp(dayDiff(from, viewTo), viewFromIndex, maxIndex);
  const forecastStartIndex = clamp(dayDiff(from, forecastStart), 0, maxIndex);
  const forecastLeft = maxIndex === 0 ? 100 : (forecastStartIndex / maxIndex) * 100;
  const viewLeft = maxIndex === 0 ? 0 : (viewFromIndex / maxIndex) * 100;
  const viewRight = maxIndex === 0 ? 0 : 100 - (viewToIndex / maxIndex) * 100;
  const viewEndLeft = maxIndex === 0 ? 100 : (viewToIndex / maxIndex) * 100;
  const visibleWindowDays = Math.max(1, viewToIndex - viewFromIndex);
  const forecastInVisibleWindow = forecastStartIndex >= viewFromIndex && forecastStartIndex <= viewToIndex;
  const forecastInWindowLeft = ((forecastStartIndex - viewFromIndex) / visibleWindowDays) * 100;
  const minimumWindowDays = Math.min(5, maxIndex);
  const scaleTicks = Array.from({ length: Math.floor(maxIndex / 7) + 1 }, (_, index) => {
    const dayOffset = index * 7;
    const day = addDaysIso(from, dayOffset);
    const kind = dayOffset % 28 === 0 ? 'major' : dayOffset % 14 === 0 ? 'medium' : 'dense';
    return {
      day,
      left: maxIndex === 0 ? 0 : (dayOffset / maxIndex) * 100,
      kind
    };
  }).filter((tick) => tick.day === from || dayDiff(tick.day, to) >= 14);

  if (scaleTicks.at(-1)?.day !== to) {
    scaleTicks.push({ day: to, left: 100, kind: 'edge' });
  }

  function changeZoomStart(nextIndex: number) {
    const safeIndex = clamp(nextIndex, 0, Math.max(0, viewToIndex - minimumWindowDays));
    const nextDay = addDaysIso(from, safeIndex);
    onFromChange(nextDay);
    onChange(nextDay);
  }

  function changeZoomEnd(nextIndex: number) {
    const safeIndex = clamp(nextIndex, Math.min(maxIndex, viewFromIndex + minimumWindowDays), maxIndex);
    const nextDay = addDaysIso(from, safeIndex);
    onToChange(nextDay);
    onChange(nextDay);
  }

  return (
    <div className="chart-time-zoom">
      <div className="chart-zoom-track-wrap">
        <div className="chart-zoom-track">
          <span className="chart-zoom-forecast" style={{ left: `${forecastLeft}%` }} />
          <span className="chart-zoom-window" style={{ left: `${viewLeft}%`, right: `${viewRight}%` }}>
            <span className="chart-zoom-edge-label chart-zoom-edge-label-start">
              {formatDateShortLabel(viewFrom)}
            </span>
            <span className="chart-zoom-edge-label chart-zoom-edge-label-end">
              {formatDateShortLabel(viewTo)}
            </span>
            {forecastInVisibleWindow && (
              <span className="chart-zoom-boundary" style={{ left: `${forecastInWindowLeft}%` }} />
            )}
          </span>
        </div>
        <input
          className="chart-zoom-range chart-zoom-from"
          aria-label="Начало видимого периода графика"
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={viewFromIndex}
          onChange={(event) => changeZoomStart(Number(event.target.value))}
        />
        <input
          className="chart-zoom-range chart-zoom-to"
          aria-label="Конец видимого периода графика"
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={viewToIndex}
          onChange={(event) => changeZoomEnd(Number(event.target.value))}
        />
        <div className="chart-time-scale">
          {scaleTicks.map((tick) => (
            <span
              key={`${tick.kind}-${tick.day}`}
              className={`chart-time-tick chart-time-tick-${tick.kind}`}
              style={{ left: `${tick.left}%` }}
            >
              {formatDateShortLabel(tick.day)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompositeProfileChart({
  rows,
  fieldCapacity,
  wiltingPoint,
  forecastStart,
  selectedDay
}: {
  rows: ProfileRow[];
  fieldCapacity: number | null;
  wiltingPoint: number | null;
  forecastStart: string;
  selectedDay: string;
}) {
  const waterDomain = waterReserveDomain(rows, fieldCapacity);
  const firstX = rows[0]?.xIndex ?? 0;
  const lastX = rows[rows.length - 1]?.xIndex ?? firstX;
  const xDomain: [number, number] = [firstX, lastX <= firstX ? firstX + 1 : lastX];
  const forecastX = rows.find((row) => row.day >= forecastStart)?.xIndex ?? lastX;
  const selectedX = rows.find((row) => row.day === selectedDay)?.xIndex ?? firstX;
  const [focusedZone, setFocusedZone] = useState<ChartZoneId | null>(null);

  function toggleZone(zone: ChartZoneId) {
    setFocusedZone((current) => (current === zone ? null : zone));
  }

  function zoneClassName(zone: ChartZoneId, baseClassName: string): string {
    return [
      'chart-zone',
      baseClassName,
      focusedZone === zone ? 'chart-zone-focused' : '',
      focusedZone && focusedZone !== zone ? 'chart-zone-compact' : ''
    ]
      .filter(Boolean)
      .join(' ');
  }

  return (
    <div className={`composite-chart${focusedZone ? ' composite-chart-focused' : ''}`}>
      <section
        className={zoneClassName('weather', 'chart-zone-weather')}
        aria-label="Атмосферные метеопараметры"
        aria-pressed={focusedZone === 'weather'}
        role="button"
        tabIndex={0}
        onClick={() => toggleZone('weather')}
        onKeyDown={(event) => handleZoneKey(event, () => toggleZone('weather'))}
      >
        <div className="chart-zone-title">Атмосферные параметры</div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} syncId="water-profile" margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="xIndex" type="number" domain={xDomain} hide />
            <YAxis
              yAxisId="temperature"
              width={LEFT_AXIS_WIDTH}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('°C')}
              tick={{ fill: '#7b5b48', fontSize: 11 }}
            />
            <YAxis
              yAxisId="humidity"
              orientation="right"
              width={RIGHT_AXIS_HUMIDITY_WIDTH}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('%')}
              tick={{ fill: '#2a756d', fontSize: 11 }}
            />
            <YAxis
              yAxisId="wind"
              orientation="right"
              width={RIGHT_AXIS_WIND_WIDTH}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('м/с')}
              tick={{ fill: '#6958c8', fontSize: 11 }}
            />
            <YAxis
              yAxisId="evaporation"
              orientation="right"
              width={RIGHT_AXIS_EVAPORATION_WIDTH}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('мм')}
              tick={{ fill: '#8f4e18', fontSize: 11 }}
            />
            <YAxis
              yAxisId="shortwave"
              orientation="right"
              width={RIGHT_AXIS_SHORTWAVE_WIDTH}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('МДж')}
              tick={{ fill: '#9b6b00', fontSize: 11 }}
            />
            <Tooltip {...CHART_TOOLTIP_PROPS} />
            <ForecastBoundary forecastX={forecastX} label yAxisId="temperature" />
            <SelectedDayMarker selectedX={selectedX} yAxisId="temperature" />
            <Line
              yAxisId="temperature"
              type="monotone"
              dataKey="temperatureFact"
              name="Температура воздуха, °C"
              stroke="#d85b2a"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="temperature"
              type="monotone"
              dataKey="temperatureForecast"
              name="Температура воздуха, °C"
              stroke="#d85b2a"
              strokeOpacity={0.34}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="humidity"
              type="monotone"
              dataKey="humidityFact"
              name="Влажность воздуха, %"
              stroke="#2a9d8f"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="humidity"
              type="monotone"
              dataKey="humidityForecast"
              name="Влажность воздуха, %"
              stroke="#2a9d8f"
              strokeOpacity={0.34}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="wind"
              type="monotone"
              dataKey="windFact"
              name="Скорость ветра, м/с"
              stroke="#7b61ff"
              strokeDasharray="5 4"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="wind"
              type="monotone"
              dataKey="windForecast"
              name="Скорость ветра, м/с"
              stroke="#7b61ff"
              strokeOpacity={0.34}
              strokeDasharray="2 5"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="evaporation"
              type="monotone"
              dataKey="potentialEvaporationDailyFact"
              name="Суточная потенциальная испаряемость, мм"
              stroke="#a75515"
              strokeDasharray="6 4"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="evaporation"
              type="monotone"
              dataKey="potentialEvaporationDailyForecast"
              name="Суточная потенциальная испаряемость, мм"
              stroke="#a75515"
              strokeOpacity={0.34}
              strokeDasharray="2 5"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="shortwave"
              type="monotone"
              dataKey="shortwaveRadiationDailyFact"
              name="Солнечная радиация, МДж/м²/сутки"
              stroke="#c28b00"
              strokeDasharray="6 3"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="shortwave"
              type="monotone"
              dataKey="shortwaveRadiationDailyForecast"
              name="Солнечная радиация, МДж/м²/сутки"
              stroke="#c28b00"
              strokeOpacity={0.34}
              strokeDasharray="2 5"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section
        className={zoneClassName('plant', 'chart-zone-plant')}
        aria-label="Параметры растений"
        aria-pressed={focusedZone === 'plant'}
        role="button"
        tabIndex={0}
        onClick={() => toggleZone('plant')}
        onKeyDown={(event) => handleZoneKey(event, () => toggleZone('plant'))}
      >
        <div className="chart-zone-title">Параметры растений</div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} syncId="water-profile" margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="xIndex" type="number" domain={xDomain} hide />
            <YAxis
              yAxisId="temperatureSum"
              width={LEFT_AXIS_WIDTH}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('°C')}
              tick={{ fill: '#9a5700', fontSize: 11 }}
            />
            <YAxis
              yAxisId="dailyWaterUse"
              orientation="right"
              width={34}
              domain={[0, 'dataMax + 1']}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('мм')}
              tick={{ fill: '#3c7653', fontSize: 11 }}
            />
            <RightAxisReserve yAxisId="plantRightReserveA" width={RIGHT_AXIS_TOTAL_WIDTH - 34} />
            <Tooltip {...CHART_TOOLTIP_PROPS} />
            <ForecastBoundary forecastX={forecastX} yAxisId="temperatureSum" />
            <SelectedDayMarker selectedX={selectedX} yAxisId="temperatureSum" />
            <Line
              yAxisId="temperatureSum"
              type="monotone"
              dataKey="temperatureSumFact"
              name="Сумма температур от даты сева, °C"
              stroke="#f08c00"
              strokeOpacity={0.78}
              strokeWidth={1.6}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="temperatureSum"
              type="monotone"
              dataKey="temperatureSumForecast"
              name="Сумма температур от даты сева, °C"
              stroke="#f08c00"
              strokeOpacity={0.24}
              strokeDasharray="5 5"
              strokeWidth={1.6}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="dailyWaterUse"
              type="monotone"
              dataKey="actualEvapotranspirationDailyFact"
              name="Фактическая эвапотранспирация, мм/сут"
              stroke="#1f6f78"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="dailyWaterUse"
              type="monotone"
              dataKey="actualEvapotranspirationDailyForecast"
              name="Фактическая эвапотранспирация, мм/сут"
              stroke="#1f6f78"
              strokeOpacity={0.42}
              strokeDasharray="5 5"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="dailyWaterUse"
              type="monotone"
              dataKey="actualSoilEvaporationDailyFact"
              name="Испарение почвы, мм/сут"
              stroke="#9a7b2f"
              strokeDasharray="4 3"
              strokeWidth={2.4}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="dailyWaterUse"
              type="monotone"
              dataKey="actualSoilEvaporationDailyForecast"
              name="Испарение почвы, мм/сут"
              stroke="#9a7b2f"
              strokeOpacity={0.38}
              strokeDasharray="2 5"
              strokeWidth={2.4}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="dailyWaterUse"
              type="monotone"
              dataKey="actualTranspirationDailyFact"
              name="Транспирация культуры, мм/сут"
              stroke="#4c956c"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="dailyWaterUse"
              type="monotone"
              dataKey="actualTranspirationDailyForecast"
              name="Транспирация культуры, мм/сут"
              stroke="#4c956c"
              strokeOpacity={0.42}
              strokeDasharray="5 5"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section
        className={zoneClassName('water', 'chart-zone-water')}
        aria-label="Влагозапасы почвы"
        aria-pressed={focusedZone === 'water'}
        role="button"
        tabIndex={0}
        onClick={() => toggleZone('water')}
        onKeyDown={(event) => handleZoneKey(event, () => toggleZone('water'))}
      >
        <div className="chart-zone-title">Влагозапасы почвы</div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} syncId="water-profile" margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="xIndex" type="number" domain={xDomain} hide />
            <YAxis
              width={LEFT_AXIS_WIDTH}
              domain={waterDomain}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('мм', { value: fieldCapacity, label: 'НВ' })}
              tick={{ fill: '#486344', fontSize: 11 }}
            />
            <YAxis
              yAxisId="humidityReserve"
              orientation="right"
              width={RIGHT_AXIS_HUMIDITY_WIDTH}
              tick={false}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="windReserve"
              orientation="right"
              width={RIGHT_AXIS_WIND_WIDTH}
              tick={false}
              tickLine={false}
              axisLine={false}
            />
            <RightAxisReserve
              yAxisId="waterEvaporationReserve"
              width={RIGHT_AXIS_EVAPORATION_WIDTH + RIGHT_AXIS_SHORTWAVE_WIDTH}
            />
            <Tooltip {...CHART_TOOLTIP_PROPS} />
            <ForecastBoundary forecastX={forecastX} />
            <SelectedDayMarker selectedX={selectedX} />
            {fieldCapacity !== null && (
              <ReferenceLine
                y={fieldCapacity}
                stroke="#101614"
                strokeWidth={1.8}
              />
            )}
            {wiltingPoint !== null && (
              <ReferenceLine
                y={wiltingPoint}
                stroke="#101614"
                strokeWidth={1.4}
              />
            )}
            <Area
              type="monotone"
              dataKey="availableRangeFact"
              name="Диапазон управления 0.6—0.9 НВ, мм"
              stroke="#78a84c"
              fill="#91c86a"
              fillOpacity={0.18}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="availableRangeForecast"
              name="Диапазон управления 0.6—0.9 НВ, мм"
              stroke="#78a84c"
              strokeOpacity={0.32}
              fill="#91c86a"
              fillOpacity={0.08}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="currentWaterFact"
              name="Текущие влагозапасы, мм"
              stroke="#1f7a3a"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="currentWaterForecast"
              name="Текущие влагозапасы, мм"
              stroke="#1f7a3a"
              strokeOpacity={0.34}
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section
        className={zoneClassName('precipitation', 'chart-zone-precipitation')}
        aria-label="Осадки и поливы"
        aria-pressed={focusedZone === 'precipitation'}
        role="button"
        tabIndex={0}
        onClick={() => toggleZone('precipitation')}
        onKeyDown={(event) => handleZoneKey(event, () => toggleZone('precipitation'))}
      >
        <div className="chart-zone-title">Осадки и поливы</div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} syncId="water-profile" margin={BOTTOM_CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="xIndex"
              type="number"
              domain={xDomain}
              hide
            />
            <YAxis
              width={LEFT_AXIS_WIDTH}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisTickWithUnitAtZero('мм')}
              tick={{ fill: '#406071', fontSize: 11 }}
            />
            <YAxis
              yAxisId="humidityReserve"
              orientation="right"
              width={RIGHT_AXIS_HUMIDITY_WIDTH}
              tick={false}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="windReserve"
              orientation="right"
              width={RIGHT_AXIS_WIND_WIDTH}
              tick={false}
              tickLine={false}
              axisLine={false}
            />
            <RightAxisReserve
              yAxisId="precipitationEvaporationReserve"
              width={RIGHT_AXIS_EVAPORATION_WIDTH + RIGHT_AXIS_SHORTWAVE_WIDTH}
            />
            <Tooltip {...CHART_TOOLTIP_PROPS} />
            <ForecastBoundary forecastX={forecastX} />
            <SelectedDayMarker selectedX={selectedX} />
            <Bar
              dataKey="precipitationFact"
              name="Осадки, мм"
              fill="#68c5f4"
              barSize={8}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="precipitationForecast"
              name="Осадки, мм"
              fill="#68c5f4"
              fillOpacity={0.36}
              barSize={8}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="irrigationFact"
              name="Поливы, мм"
              fill="#2f6fd6"
              barSize={8}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="irrigationForecast"
              name="Поливы, мм"
              fill="#2f6fd6"
              fillOpacity={0.34}
              barSize={8}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
