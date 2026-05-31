import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
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
  actualEvaporationSum: number | null;
  actualEvaporationSumFact: number | null;
  actualEvaporationSumForecast: number | null;
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
  }
};

function localDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysIso(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + offset);
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

function findSeries(
  profile: KornixProfileTimeseriesDto,
  code: RequiredBackendMetricLongName
): KornixMetricSeriesDto | undefined {
  return profile.metrics.find((series) => series.long_name_for_code === code);
}

function minCoverage(series: KornixMetricSeriesDto): number | null {
  const values = series.points
    .map((point) => (typeof point.coverage === 'number' ? point.coverage : null))
    .filter((value): value is number => value !== null);
  if (!values.length) {
    return null;
  }
  return Math.min(...values);
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
  return [day <= forecastStart ? value : null, day >= forecastStart ? value : null];
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
      typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.areaHa > 0
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

  return days.map((day) => {
    const temperature = meanValue(series('air_temperature_daily_c'), day);
    const humidity = meanValue(series('relative_humidity_daily_pct'), day);
    const wind = meanValue(series('wind_daily_mps'), day);
    const potentialEvaporationDaily = scalarValue(series('eto_daily_mm'), day);
    const temperatureSum = scalarValue(series('positive_temperature_sum_from_sowing_c'), day);
    const actualEvaporationSum = scalarValue(series('crop_transpiration_daily_mm'), day);
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
    const [actualEvaporationSumFact, actualEvaporationSumForecast] = splitForecastValue(
      day,
      forecastStart,
      actualEvaporationSum
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
      actualEvaporationSum,
      actualEvaporationSumFact,
      actualEvaporationSumForecast,
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

function buildProfileCsv(rows: ProfileRow[], saturation: number | null, forecastStart: string): string {
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
      row.actualEvaporationSum,
      saturation,
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
  selectionLabel,
  from,
  to,
  onFromChange,
  onToChange,
  onCsvChange,
  onExportGraphics,
  onExportData
}: {
  calculationRunId: string | null;
  fields: FieldSeasonMapFeature[];
  fieldSeasonIds: string[];
  selectionLabel: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onCsvChange: (csv: string | null) => void;
  onExportGraphics: () => Promise<void>;
  onExportData: () => void;
}) {
  const today = localDateIso(new Date());
  const forecastStart = addDaysIso(today, 1);
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

  useEffect(() => {
    if (!calculationRunId || fieldSeasonIds.length === 0 || isLoading || isError) {
      onCsvChange(null);
    }
  }, [calculationRunId, fieldSeasonIds.length, isError, isLoading, onCsvChange]);

  return (
    <section className="chart-panel">
      <div className="chart-toolbar">
        <div className="chart-profile-title">
          <strong>Погода, водный режим почвы, орошение {selectionLabel}</strong>
        </div>
      </div>

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
  const today = localDateIso(new Date());
  const firstDay = rows[0]?.day ?? from;
  const lastDay = rows.length > 0 ? rows[rows.length - 1].day : to;
  const [selectedDay, setSelectedDay] = useState(today);
  const selectedDayInRange = addDaysIso(firstDay, clamp(dayDiff(firstDay, selectedDay), 0, dayDiff(firstDay, lastDay)));
  const saturation = fullSaturationMm(rows);
  const coverage = Math.min(
    ...profile.metrics
      .map((data) => minCoverage(data))
      .filter((value): value is number => value !== null)
  );
  const showCoverageWarning = Number.isFinite(coverage) && coverage < 0.9;
  const aggregation = profile.aggregation;
  const warnings = Array.from(
    new Map(profile.warnings.map((warning) => [warning.code, warning])).values()
  );
  const profileCsv = buildProfileCsv(rows, saturation, forecastStart);

  useEffect(() => {
    onCsvChange(profileCsv);
  }, [onCsvChange, profileCsv]);

  useEffect(() => {
    setSelectedDay((current) =>
      addDaysIso(firstDay, clamp(dayDiff(firstDay, current), 0, dayDiff(firstDay, lastDay)))
    );
  }, [firstDay, lastDay]);

  return (
    <div className="chart-workbench">
      <div className="chart-box">
        <CompositeProfileChart
          rows={rows}
          saturation={saturation}
          forecastStart={forecastStart}
          selectedDay={selectedDayInRange}
        />
        <ChartTimeRuler
          from={firstDay}
          to={lastDay}
          forecastStart={forecastStart}
          day={selectedDayInRange}
          onChange={setSelectedDay}
        />
      </div>
      <aside className="chart-side-panel">
        <div className="chart-date-controls">
          <label>
            C
            <input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} />
          </label>
          <label>
            По
            <input type="date" value={to} onChange={(event) => onToChange(event.target.value)} />
          </label>
        </div>

        <div className="chart-caption">
          <strong>Водный режим</strong>
          {aggregation && (
            <span>
              {aggregation.selectedFieldCount} полей · {aggregation.totalAreaHa.toFixed(1)} га
            </span>
          )}
          {!aggregation && selectedCount === 1 && <span>одно поле</span>}
        </div>

        <div className="chart-caption chart-caption-muted">
          Прогноз: 7 суток с {forecastStart}
        </div>

        <LegendStrip />

        {showCoverageWarning && (
          <div className="warning-state">
            Часть точек рассчитана по неполному покрытию. Минимальное покрытие:{' '}
            {Math.round((coverage ?? 0) * 100)}%.
          </div>
        )}

        {warnings.map((warning) => (
          <div key={warning.code} className="warning-state">
            {warning.message}
          </div>
        ))}

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
  forecastStart,
  label,
  yAxisId
}: {
  forecastStart: string;
  label?: boolean;
  yAxisId?: string;
}) {
  return (
    <ReferenceLine
      yAxisId={yAxisId}
      x={forecastStart}
      stroke="#d95f0b"
      strokeDasharray="4 4"
      strokeWidth={1.5}
      label={label ? { value: 'прогноз', position: 'insideTop', fill: '#b44e08', fontSize: 11 } : undefined}
    />
  );
}

function SelectedDayMarker({ day, yAxisId }: { day: string; yAxisId?: string }) {
  return (
    <ReferenceLine
      yAxisId={yAxisId}
      x={day}
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

function ChartTimeRuler({
  day,
  from,
  to,
  forecastStart,
  onChange
}: {
  day: string;
  from: string;
  to: string;
  forecastStart: string;
  onChange: (day: string) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const maxIndex = Math.max(0, dayDiff(from, to));
  const selectedIndex = clamp(dayDiff(from, day), 0, maxIndex);
  const selectedDay = addDaysIso(from, selectedIndex);
  const forecastStartIndex = clamp(dayDiff(from, forecastStart), 0, maxIndex);
  const forecastLeft = maxIndex === 0 ? 100 : (forecastStartIndex / maxIndex) * 100;
  const thumbLeft = maxIndex === 0 ? 0 : (selectedIndex / maxIndex) * 100;
  const isForecast = selectedDay >= forecastStart;

  function pauseAnimation() {
    setIsPlaying(false);
  }

  function changeBy(offset: number) {
    pauseAnimation();
    onChange(addDaysIso(from, clamp(selectedIndex + offset, 0, maxIndex)));
  }

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const nextIndex = selectedIndex >= maxIndex ? 0 : selectedIndex + 1;
      onChange(addDaysIso(from, nextIndex));
    }, 900);

    return () => {
      window.clearInterval(timer);
    };
  }, [from, isPlaying, maxIndex, onChange, selectedIndex]);

  return (
    <div className="map-time-ruler chart-time-ruler">
      <button
        type="button"
        className="map-time-play"
        aria-label={isPlaying ? 'Остановить анимацию дат графика' : 'Запустить анимацию дат графика'}
        onClick={() => setIsPlaying((value) => !value)}
      >
        {isPlaying ? 'Ⅱ' : '▶'}
      </button>
      <button type="button" aria-label="Предыдущий день графика" onClick={() => changeBy(-1)}>
        ‹
      </button>
      <div className="map-time-track-wrap">
        <div
          className="map-time-label"
          role="button"
          tabIndex={0}
          aria-label="Ползунок даты графика"
          style={{ left: `${thumbLeft}%` }}
          onKeyDown={pauseAnimation}
          onPointerDown={pauseAnimation}
        >
          {formatDateLabel(selectedDay)}
          {isForecast && <span>прогноз</span>}
        </div>
        <div className="map-time-track">
          <span className="map-time-forecast" style={{ left: `${forecastLeft}%` }} />
          <span className="map-time-boundary" style={{ left: `${forecastLeft}%` }} />
        </div>
        <input
          aria-label="Дата отображения графика"
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={selectedIndex}
          onChange={(event) => {
            pauseAnimation();
            onChange(addDaysIso(from, Number(event.target.value)));
          }}
          onPointerDown={pauseAnimation}
        />
        <div className="map-time-scale">
          <span>{formatDateLabel(from)}</span>
          <span>{formatDateLabel(forecastStart)}</span>
          <span>{formatDateLabel(to)}</span>
        </div>
      </div>
      <button type="button" aria-label="Следующий день графика" onClick={() => changeBy(1)}>
        ›
      </button>
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
            <XAxis dataKey="day" hide />
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
            <ForecastBoundary forecastStart={forecastStart} label yAxisId="temperature" />
            <SelectedDayMarker day={selectedDay} yAxisId="temperature" />
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
            <XAxis dataKey="day" hide />
            <YAxis
              yAxisId="temperatureSum"
              width={LEFT_AXIS_WIDTH}
              unit="°"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#9a5700', fontSize: 11 }}
            />
            <YAxis
              yAxisId="actualEvaporation"
              orientation="right"
              width={48}
              unit="мм"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#3c7653', fontSize: 11 }}
            />
            <RightAxisReserve yAxisId="plantRightReserveA" width={RIGHT_AXIS_TOTAL_WIDTH - 48} />
            <Tooltip {...CHART_TOOLTIP_PROPS} />
            <ForecastBoundary forecastStart={forecastStart} yAxisId="temperatureSum" />
            <SelectedDayMarker day={selectedDay} yAxisId="temperatureSum" />
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
              yAxisId="actualEvaporation"
              type="monotone"
              dataKey="actualEvaporationSumFact"
              name="Фактическое суммарное испарение, мм"
              stroke="#4c956c"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="actualEvaporation"
              type="monotone"
              dataKey="actualEvaporationSumForecast"
              name="Фактическое суммарное испарение, мм"
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
            <XAxis dataKey="day" hide />
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
            <ForecastBoundary forecastStart={forecastStart} />
            <SelectedDayMarker day={selectedDay} />
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
              dataKey="day"
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
            <ForecastBoundary forecastStart={forecastStart} />
            <SelectedDayMarker day={selectedDay} />
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
