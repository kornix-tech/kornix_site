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
import type {
  FieldSeasonMapFeature,
  KornixMetricSeriesDto,
  KornixProfileTimeseriesDto,
  RequiredBackendMetricLongName
} from '../types/kornix';
import { deriveWaterMetrics, deriveWaterThresholds } from '../features/water-regime/derivedWaterMetrics';
import { ExportActions } from './ExportActions';
import { buildCsv } from './exportUtils';

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
  temperatureSum: number | null;
  temperatureSumFact: number | null;
  temperatureSumForecast: number | null;
  cropTranspirationDaily: number | null;
  cropTranspirationDailyFact: number | null;
  cropTranspirationDailyForecast: number | null;
  availableRange: [number, number] | null;
  availableRangeFact: [number, number] | null;
  availableRangeForecast: [number, number] | null;
  availableLower: number | null;
  availableUpper: number | null;
  totalCapacity: number | null;
  optimumWater: number | null;
  optimumWaterFact: number | null;
  optimumWaterForecast: number | null;
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

type ThresholdCoefficients = {
  upper: number | null;
  optimum: number | null;
  lower: number | null;
};

const LEGEND_ITEMS = [
  { label: 'Температура воздуха', color: '#d85b2a', kind: 'line' },
  { label: 'Влажность воздуха', color: '#2a9d8f', kind: 'line' },
  { label: 'Скорость ветра', color: '#7b61ff', kind: 'dash' },
  { label: 'ETo', color: '#a75515', kind: 'dash' },
  { label: 'Солнечная радиация', color: '#c28b00', kind: 'dash' },
  { label: 'Сумма температур', color: '#f08c00', kind: 'line' },
  { label: 'Транспирация культуры', color: '#4c956c', kind: 'line' },
  { label: 'Полная влагоёмкость', color: '#123b73', kind: 'dash' },
  { label: 'Диапазон управления', color: '#91c86a', kind: 'area' },
  { label: 'Влагозапасы почвы', color: '#1f7a3a', kind: 'line' },
  { label: 'Эффективные осадки', color: '#68c5f4', kind: 'bar' },
  { label: 'Эффективный полив', color: '#2f6fd6', kind: 'bar' }
];

const CHART_MARGIN = {
  top: 14,
  right: 8,
  left: 10,
  bottom: 0
};

const LEFT_AXIS_WIDTH = 44;
const RIGHT_AXIS_HUMIDITY_WIDTH = 42;
const RIGHT_AXIS_WIND_WIDTH = 46;
const RIGHT_AXIS_EVAPORATION_WIDTH = 42;
const RIGHT_AXIS_TOTAL_WIDTH =
  RIGHT_AXIS_HUMIDITY_WIDTH + RIGHT_AXIS_WIND_WIDTH + RIGHT_AXIS_EVAPORATION_WIDTH;

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

function weightedCoefficient(
  fields: FieldSeasonMapFeature[],
  fieldSeasonIds: string[],
  key: 'koef_upper_limit' | 'koef_optimum' | 'koef_lower_limit'
): number | null {
  const allowedIds = new Set(fieldSeasonIds);
  const weightedValues = fields
    .filter((field) => allowedIds.has(field.properties.fieldSeasonId))
    .map((field) => ({
      value: field.properties[key],
      areaHa: field.properties.areaHa
    }))
    .filter((entry): entry is { value: number; areaHa: number } =>
      typeof entry.value === 'number' &&
      Number.isFinite(entry.value) &&
      typeof entry.areaHa === 'number' &&
      entry.areaHa > 0
    );

  const totalAreaHa = weightedValues.reduce((sum, entry) => sum + entry.areaHa, 0);
  if (totalAreaHa <= 0) {
    return null;
  }

  return weightedValues.reduce((sum, entry) => sum + entry.value * entry.areaHa, 0) / totalAreaHa;
}

function buildThresholdCoefficients(
  fields: FieldSeasonMapFeature[],
  fieldSeasonIds: string[]
): ThresholdCoefficients {
  return {
    upper: weightedCoefficient(fields, fieldSeasonIds, 'koef_upper_limit'),
    optimum: weightedCoefficient(fields, fieldSeasonIds, 'koef_optimum'),
    lower: weightedCoefficient(fields, fieldSeasonIds, 'koef_lower_limit')
  };
}

function buildProfileRows(
  profile: KornixProfileTimeseriesDto,
  forecastStart: string,
  thresholdCoefficients: ThresholdCoefficients
): ProfileRow[] {
  const days = Array.from(
    new Set(profile.metrics.flatMap((metric) => metric.points.map((point) => point.day)))
  ).sort();
  const series = (code: RequiredBackendMetricLongName) => findSeries(profile, code);

  return days.map((day, xIndex) => {
    const temperature = meanValue(series('air_temperature_daily_c'), day);
    const humidity = meanValue(series('relative_humidity_daily_pct'), day);
    const wind = meanValue(series('wind_daily_mps'), day);
    const potentialEvaporationDaily = scalarValue(series('eto_daily_mm'), day);
    const temperatureSum = scalarValue(series('positive_temperature_sum_from_sowing_c'), day);
    const cropTranspirationDaily = scalarValue(series('crop_transpiration_daily_mm'), day);
    const totalCapacity = scalarValue(series('soil_total_capacity_water_mm'), day);
    const fieldCapacity = scalarValue(series('soil_field_capacity_water_mm'), day);
    const wiltingPoint = scalarValue(series('soil_wilting_point_capacity_water_mm'), day);
    const currentWater = scalarValue(series('soil_water_content_mm'), day);
    const derived = deriveWaterMetrics({
      soil_field_capacity_water_mm: fieldCapacity,
      soil_wilting_point_capacity_water_mm: wiltingPoint,
      soil_water_content_mm: currentWater
    });
    const thresholds = deriveWaterThresholds({
      soil_field_capacity_water_mm: fieldCapacity,
      koef_upper_limit: thresholdCoefficients.upper,
      koef_optimum: thresholdCoefficients.optimum,
      koef_lower_limit: thresholdCoefficients.lower
    });
    const range: [number, number] | null =
      thresholds.lower_limit_water_mm !== null && thresholds.upper_limit_water_mm !== null
        ? [thresholds.lower_limit_water_mm, thresholds.upper_limit_water_mm]
        : derived.available_water_content_mm !== null && wiltingPoint !== null
          ? [wiltingPoint, wiltingPoint + derived.available_water_content_mm]
          : null;
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
    const [temperatureSumFact, temperatureSumForecast] = splitForecastValue(day, forecastStart, temperatureSum);
    const [cropTranspirationDailyFact, cropTranspirationDailyForecast] = splitForecastValue(
      day,
      forecastStart,
      cropTranspirationDaily
    );
    const [availableRangeFact, availableRangeForecast] = splitForecastValue(day, forecastStart, range);
    const [currentWaterFact, currentWaterForecast] = splitForecastValue(day, forecastStart, currentWater);
    const [optimumWaterFact, optimumWaterForecast] = splitForecastValue(
      day,
      forecastStart,
      thresholds.optimum_water_mm
    );
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
      temperatureSum,
      temperatureSumFact,
      temperatureSumForecast,
      cropTranspirationDaily,
      cropTranspirationDailyFact,
      cropTranspirationDailyForecast,
      availableRange: range,
      availableRangeFact,
      availableRangeForecast,
      availableLower: range?.[0] ?? null,
      availableUpper: range?.[1] ?? null,
      totalCapacity,
      optimumWater: thresholds.optimum_water_mm,
      optimumWaterFact,
      optimumWaterForecast,
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

function fullSaturationMm(rows: ProfileRow[]): number | null {
  const totalCapacityValues = rows
    .map((row) => row.totalCapacity)
    .filter((value): value is number => typeof value === 'number');

  if (!totalCapacityValues.length) {
    return null;
  }

  return Math.ceil(Math.max(...totalCapacityValues));
}

function waterReserveDomain(rows: ProfileRow[], saturation: number | null): [number, number | string] {
  const waterValues = rows
    .flatMap((row) => [row.availableLower, row.availableUpper, row.currentWater])
    .filter((value): value is number => typeof value === 'number');

  if (!waterValues.length) {
    return [0, 'dataMax + 20'];
  }

  const visibleMinimum = Math.max(0, Math.floor(Math.min(...waterValues) * 0.5));
  const visibleMaximum = saturation === null ? 'dataMax + 20' : Math.ceil(saturation * 1.06);

  return [visibleMinimum, visibleMaximum];
}

function buildProfileCsv(rows: ProfileRow[], forecastStart: string): string {
  return buildCsv([
    [
      'day',
      'period',
      'air_temperature_daily_c',
      'relative_humidity_daily_pct',
      'wind_daily_mps',
      'eto_daily_mm',
      'positive_temperature_sum_from_sowing_c',
      'crop_transpiration_daily_mm',
      'soil_total_capacity_water_mm',
      'available_water_lower_mm',
      'optimum_water_mm',
      'available_water_upper_mm',
      'soil_water_content_mm',
      'precipitation_effective_daily_mm',
      'irrigation_effective_daily_mm'
    ],
    ...rows.map((row) => [
      row.day,
      row.day >= forecastStart ? 'forecast' : 'fact',
      row.temperature,
      row.humidity,
      row.wind,
      row.potentialEvaporationDaily,
      row.temperatureSum,
      row.cropTranspirationDaily,
      row.totalCapacity,
      row.availableLower,
      row.optimumWater,
      row.availableUpper,
      row.currentWater,
      row.precipitation,
      row.irrigation
    ])
  ]);
}

export function WaterRegimeChart({
  calculationRunId,
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
  onExportGraphics,
  onExportData
}: {
  calculationRunId: string | null;
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
  onExportGraphics: () => Promise<void>;
  onExportData: () => void;
}) {
  const profileQuery = useQuery({
    queryKey: ['water-regime-profile', calculationRunId, fieldSeasonIds.join(',')],
    enabled: Boolean(calculationRunId) && fieldSeasonIds.length > 0,
    queryFn: () =>
      kornixApi.getProfileTimeseries({
        calculationRunId: calculationRunId ?? '',
        fieldSeasonIds,
        aggregation: fieldSeasonIds.length > 1 ? 'area_weighted_mean' : undefined
      })
  });

  const isLoading = profileQuery.isLoading;
  const isError = profileQuery.isError;
  const forecastStart = profileQuery.data?.forecastStartDate ?? forecastStartDate;
  const forecastEnd = profileQuery.data?.forecastEndDate ?? forecastEndDate;

  useEffect(() => {
    if (!calculationRunId || fieldSeasonIds.length === 0 || isLoading || isError) {
      onCsvChange(null);
    }
  }, [calculationRunId, fieldSeasonIds.length, isError, isLoading, onCsvChange]);

  return (
    <section className="chart-panel">
      {fieldSeasonIds.length === 0 && (
        <div className="empty-state">Выберите одно или несколько полей слева.</div>
      )}
      {!calculationRunId && <div className="empty-state">Нет расчёта. Утвердите поливы.</div>}

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
          to={to}
          onFromChange={onFromChange}
          onToChange={onToChange}
          onCsvChange={onCsvChange}
          onExportGraphics={onExportGraphics}
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
  to,
  onFromChange,
  onToChange,
  onCsvChange,
  onExportGraphics,
  onExportData
}: {
  profile: KornixProfileTimeseriesDto;
  fields: FieldSeasonMapFeature[];
  forecastStart: string;
  forecastEnd: string;
  serverDate: string;
  from: string;
  selectedCount: number;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onCsvChange: (csv: string | null) => void;
  onExportGraphics: () => Promise<void>;
  onExportData: () => void;
}) {
  const thresholdCoefficients = useMemo(
    () => buildThresholdCoefficients(fields, profile.selectedFieldSeasonIds),
    [fields, profile.selectedFieldSeasonIds]
  );
  const allRows = useMemo(
    () => buildProfileRows(profile, forecastStart, thresholdCoefficients),
    [forecastStart, profile, thresholdCoefficients]
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
  const saturation = fullSaturationMm(rows);
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
  const profileCsv = buildProfileCsv(rows, forecastStart);

  useEffect(() => {
    onCsvChange(profileCsv);
  }, [onCsvChange, profileCsv]);

  useEffect(() => {
    setSelectedDay((current) =>
      addDaysIso(viewFirstDay, clamp(dayDiff(viewFirstDay, current), 0, dayDiff(viewFirstDay, viewLastDay)))
    );
  }, [viewFirstDay, viewLastDay]);

  return (
    <div className="chart-workbench">
      <div className="chart-box">
        <CompositeProfileChart
          rows={rows}
          saturation={saturation}
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

        <LegendStrip />

        <ExportActions onExportGraphics={onExportGraphics} onExportData={onExportData} dataDisabled={!profileCsv} />
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
  saturation,
  forecastStart,
  selectedDay
}: {
  rows: ProfileRow[];
  saturation: number | null;
  forecastStart: string;
  selectedDay: string;
}) {
  const waterDomain = waterReserveDomain(rows, saturation);
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
              unit="°"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#7b5b48', fontSize: 11 }}
            />
            <YAxis
              yAxisId="humidity"
              orientation="right"
              width={RIGHT_AXIS_HUMIDITY_WIDTH}
              unit="%"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#2a756d', fontSize: 11 }}
            />
            <YAxis
              yAxisId="wind"
              orientation="right"
              width={RIGHT_AXIS_WIND_WIDTH}
              unit="м/с"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6958c8', fontSize: 11 }}
            />
            <YAxis
              yAxisId="evaporation"
              orientation="right"
              width={RIGHT_AXIS_EVAPORATION_WIDTH}
              unit="мм"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#8f4e18', fontSize: 11 }}
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
              unit="°"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#9a5700', fontSize: 11 }}
            />
            <YAxis
              yAxisId="cropTranspiration"
              orientation="right"
              width={48}
              unit="мм"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#3c7653', fontSize: 11 }}
            />
            <RightAxisReserve yAxisId="plantRightReserveA" width={RIGHT_AXIS_TOTAL_WIDTH - 48} />
            <Tooltip {...CHART_TOOLTIP_PROPS} />
            <ForecastBoundary forecastX={forecastX} yAxisId="temperatureSum" />
            <SelectedDayMarker selectedX={selectedX} yAxisId="temperatureSum" />
            <Line
              yAxisId="temperatureSum"
              type="monotone"
              dataKey="temperatureSumFact"
              name="Сумма температур от даты сева, °C"
              stroke="#f08c00"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="temperatureSum"
              type="monotone"
              dataKey="temperatureSumForecast"
              name="Сумма температур от даты сева, °C"
              stroke="#f08c00"
              strokeOpacity={0.34}
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="cropTranspiration"
              type="monotone"
              dataKey="cropTranspirationDailyFact"
              name="Суточная транспирация культуры, мм"
              stroke="#4c956c"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="cropTranspiration"
              type="monotone"
              dataKey="cropTranspirationDailyForecast"
              name="Суточная транспирация культуры, мм"
              stroke="#4c956c"
              strokeOpacity={0.34}
              strokeDasharray="5 5"
              strokeWidth={2}
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
              unit="мм"
              domain={waterDomain}
              tickLine={false}
              axisLine={false}
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
            <RightAxisReserve yAxisId="waterEvaporationReserve" width={RIGHT_AXIS_EVAPORATION_WIDTH} />
            <Tooltip {...CHART_TOOLTIP_PROPS} />
            <ForecastBoundary forecastX={forecastX} />
            <SelectedDayMarker selectedX={selectedX} />
            {saturation !== null && (
              <ReferenceLine
                y={saturation}
                label={{ value: 'полное насыщение', position: 'insideTopRight', fill: '#123b73' }}
                stroke="#123b73"
                strokeDasharray="6 4"
                strokeWidth={2}
              />
            )}
            <Area
              type="monotone"
              dataKey="availableRangeFact"
              name="Доступные влагозапасы, мм"
              stroke="#78a84c"
              fill="#91c86a"
              fillOpacity={0.28}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="availableRangeForecast"
              name="Доступные влагозапасы, мм"
              stroke="#78a84c"
              strokeOpacity={0.32}
              fill="#91c86a"
              fillOpacity={0.1}
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
            <Line
              type="monotone"
              dataKey="optimumWaterFact"
              name="Оптимум влагозапасов, мм"
              stroke="#5f8f2f"
              strokeDasharray="7 4"
              strokeWidth={1.6}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="optimumWaterForecast"
              name="Оптимум влагозапасов, мм"
              stroke="#5f8f2f"
              strokeOpacity={0.28}
              strokeDasharray="4 6"
              strokeWidth={1.6}
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
              unit="мм"
              tickLine={false}
              axisLine={false}
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
            <RightAxisReserve yAxisId="precipitationEvaporationReserve" width={RIGHT_AXIS_EVAPORATION_WIDTH} />
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
