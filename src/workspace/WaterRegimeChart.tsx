import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useQueries } from '@tanstack/react-query';
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
import type { WaterRegimeTimeseriesDto } from '../types/kornix';
import { ExportActions } from './ExportActions';
import { buildCsv } from './exportUtils';

type ProfileMetricCode =
  | 'temperature_daily_c'
  | 'temperature_sum_from_sowing_c'
  | 'relative_humidity_mean_pct'
  | 'wind_speed_2m_mean_mps'
  | 'potential_evapotranspiration_daily_mm'
  | 'actual_evapotranspiration_sum_mm'
  | 'available_water_range_mm'
  | 'current_water_mm'
  | 'precipitation_mm'
  | 'actual_irrigation_mm';

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

const PROFILE_METRICS: ProfileMetricCode[] = [
  'temperature_daily_c',
  'relative_humidity_mean_pct',
  'wind_speed_2m_mean_mps',
  'potential_evapotranspiration_daily_mm',
  'temperature_sum_from_sowing_c',
  'actual_evapotranspiration_sum_mm',
  'available_water_range_mm',
  'current_water_mm',
  'precipitation_mm',
  'actual_irrigation_mm'
];

const LEGEND_ITEMS = [
  { label: 'Температура воздуха', color: '#d85b2a', kind: 'line' },
  { label: 'Влажность воздуха', color: '#2a9d8f', kind: 'line' },
  { label: 'Скорость ветра', color: '#7b61ff', kind: 'dash' },
  { label: 'Суточная испаряемость', color: '#a75515', kind: 'dash' },
  { label: 'Сумма температур', color: '#f08c00', kind: 'line' },
  { label: 'Фактическое испарение', color: '#4c956c', kind: 'line' },
  { label: 'Полное насыщение почвы', color: '#123b73', kind: 'dash' },
  { label: 'Доступные влагозапасы', color: '#91c86a', kind: 'area' },
  { label: 'Текущие влагозапасы', color: '#1f7a3a', kind: 'line' },
  { label: 'Осадки', color: '#68c5f4', kind: 'bar' },
  { label: 'Поливы', color: '#2f6fd6', kind: 'bar' }
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

function minCoverage(data: WaterRegimeTimeseriesDto): number | null {
  const values = data.points
    .map((point) => (typeof point.coverage === 'number' ? point.coverage : null))
    .filter((value): value is number => value !== null);
  if (!values.length) {
    return null;
  }
  return Math.min(...values);
}

function scalarValue(data: WaterRegimeTimeseriesDto | undefined, day: string): number | null {
  if (!data || data.valueKind !== 'scalar') {
    return null;
  }

  return data.points.find((point) => point.day === day)?.value ?? null;
}

function temperatureMean(data: WaterRegimeTimeseriesDto | undefined, day: string): number | null {
  if (!data || data.valueKind !== 'min_mean_max') {
    return null;
  }

  return data.points.find((point) => point.day === day)?.mean ?? null;
}

function availableRange(data: WaterRegimeTimeseriesDto | undefined, day: string): [number, number] | null {
  if (!data || data.valueKind !== 'range') {
    return null;
  }

  const point = data.points.find((item) => item.day === day);
  if (point?.lower === null || point?.upper === null || point?.lower === undefined || point?.upper === undefined) {
    return null;
  }

  return [point.lower, point.upper];
}

function splitForecastValue<T>(
  day: string,
  forecastStart: string,
  value: T | null
): [T | null, T | null] {
  return [day <= forecastStart ? value : null, day >= forecastStart ? value : null];
}

function buildProfileRows(
  dataByMetric: Partial<Record<ProfileMetricCode, WaterRegimeTimeseriesDto>>,
  forecastStart: string
): ProfileRow[] {
  const days = Array.from(
    new Set(PROFILE_METRICS.flatMap((metric) => dataByMetric[metric]?.points.map((point) => point.day) ?? []))
  ).sort();

  return days.map((day) => {
    const range = availableRange(dataByMetric.available_water_range_mm, day);
    const temperature = temperatureMean(dataByMetric.temperature_daily_c, day);
    const humidity = scalarValue(dataByMetric.relative_humidity_mean_pct, day);
    const wind = scalarValue(dataByMetric.wind_speed_2m_mean_mps, day);
    const potentialEvaporationDaily = scalarValue(dataByMetric.potential_evapotranspiration_daily_mm, day);
    const temperatureSum = scalarValue(dataByMetric.temperature_sum_from_sowing_c, day);
    const actualEvaporationSum = scalarValue(dataByMetric.actual_evapotranspiration_sum_mm, day);
    const currentWater = scalarValue(dataByMetric.current_water_mm, day);
    const precipitation = scalarValue(dataByMetric.precipitation_mm, day);
    const irrigation = scalarValue(dataByMetric.actual_irrigation_mm, day);
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
  const upperValues = rows
    .map((row) => row.availableUpper)
    .filter((value): value is number => typeof value === 'number');

  if (!upperValues.length) {
    return null;
  }

  // Верхняя граница полного насыщения пока выводится как инженерная оценка над диапазоном доступной влаги.
  return Math.ceil(Math.max(...upperValues) * 1.18);
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
      'temperature_air_c',
      'relative_humidity_pct',
      'wind_speed_mps',
      'potential_evapotranspiration_daily_mm',
      'temperature_sum_from_sowing_c',
      'actual_evapotranspiration_sum_mm',
      'full_saturation_mm',
      'available_water_lower_mm',
      'available_water_upper_mm',
      'current_water_mm',
      'precipitation_mm',
      'actual_irrigation_mm'
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
      row.availableUpper,
      row.currentWater,
      row.precipitation,
      row.irrigation
    ])
  ]);
}

export function WaterRegimeChart({
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
  const forecastTo = maxDateIso(to, addDaysIso(today, 7));
  const queries = useQueries({
    queries: PROFILE_METRICS.map((profileMetric) => ({
      queryKey: ['water-regime-profile', fieldSeasonIds.join(','), profileMetric, from, forecastTo],
      enabled: fieldSeasonIds.length > 0,
      queryFn: () =>
        kornixApi.getWaterRegimeTimeseries({
          fieldSeasonIds,
          metric: profileMetric,
          from,
          to: forecastTo,
          aggregation: 'area_weighted_mean'
        })
    }))
  });

  const isLoading = queries.some((query) => query.isLoading);
  const isError = queries.some((query) => query.isError);
  const dataByMetric = PROFILE_METRICS.reduce<Partial<Record<ProfileMetricCode, WaterRegimeTimeseriesDto>>>(
    (result, profileMetric, index) => {
      if (queries[index].data) {
        result[profileMetric] = queries[index].data;
      }
      return result;
    },
    {}
  );

  useEffect(() => {
    if (fieldSeasonIds.length === 0 || isLoading || isError) {
      onCsvChange(null);
    }
  }, [fieldSeasonIds.length, isError, isLoading, onCsvChange]);

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

      {isLoading && <div className="empty-state">Загрузка графика…</div>}
      {isError && <div className="error-state">Не удалось загрузить временной ряд.</div>}
      {fieldSeasonIds.length > 0 && !isLoading && !isError && (
        <ChartBody
          dataByMetric={dataByMetric}
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
  dataByMetric,
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
  dataByMetric: Partial<Record<ProfileMetricCode, WaterRegimeTimeseriesDto>>;
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
  const rows = buildProfileRows(dataByMetric, forecastStart);
  const today = localDateIso(new Date());
  const firstDay = rows[0]?.day ?? from;
  const lastDay = rows.length > 0 ? rows[rows.length - 1].day : to;
  const [selectedDay, setSelectedDay] = useState(today);
  const selectedDayInRange = addDaysIso(firstDay, clamp(dayDiff(firstDay, selectedDay), 0, dayDiff(firstDay, lastDay)));
  const saturation = fullSaturationMm(rows);
  const coverage = Math.min(
    ...Object.values(dataByMetric)
      .map((data) => (data ? minCoverage(data) : null))
      .filter((value): value is number => value !== null)
  );
  const showCoverageWarning = coverage !== null && coverage < 0.9;
  const aggregation = dataByMetric.current_water_mm?.aggregation ?? dataByMetric.available_water_range_mm?.aggregation;
  const warnings = Array.from(
    new Map(
      Object.values(dataByMetric).flatMap((data) => data?.warnings.map((warning) => [warning.code, warning]) ?? [])
    ).values()
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
