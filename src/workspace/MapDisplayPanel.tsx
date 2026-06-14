import type { MapDisplayMode } from './FieldMap';
import { visibleUserWarnings } from './warningPresentation';

type LegendItem = {
  label: string;
  color: string;
};

const displayOptions: Array<{ value: MapDisplayMode; label: string }> = [
  { value: 'minimum_irrigation', label: 'Минимальный полив' },
  { value: 'status', label: 'Уровень влагозапасов' },
  { value: 'water_percent', label: 'Процент продуктивных влагозапасов' },
  { value: 'field_capacity_percent', label: 'Влагозапасы в % НВ' },
  { value: 'temperature_sum', label: 'Сумма температур от даты сева' }
];

const statusLegend: LegendItem[] = [
  { label: 'Норма', color: '#eaf6e3' },
  { label: 'Требуется анализ', color: '#fff8df' },
  { label: 'Нужен полив', color: '#fff0f0' },
  { label: 'Нет данных', color: '#f0f3ef' }
];

const waterPercentLegend: LegendItem[] = [
  { label: '0-19%', color: '#d84a40' },
  { label: '20-39%', color: '#e9863d' },
  { label: '40-59%', color: '#e7c94d' },
  { label: '60-79%', color: '#5aa85d' },
  { label: '80-100%', color: '#2f74d0' }
];

const fieldCapacityPercentLegend: LegendItem[] = [
  { label: '0-50%', color: '#d84a40' },
  { label: '51-70%', color: '#e9863d' },
  { label: '71-90%', color: '#5aa85d' },
  { label: '91-100%', color: '#e7c94d' }
];

const minimumIrrigationLegend: LegendItem[] = [
  { label: 'менее 5 мм', color: 'transparent' },
  { label: '5-15 мм', color: '#32b8e6' },
  { label: '16-25 мм', color: '#0646c8' },
  { label: 'более 25 мм', color: '#00a99d' }
];

const gradientLegend: Record<Exclude<MapDisplayMode, 'status' | 'water_percent' | 'field_capacity_percent' | 'minimum_irrigation'>, { min: string; max: string; gradient: string }> = {
  temperature_sum: {
    min: 'меньше',
    max: 'больше',
    gradient: 'linear-gradient(90deg, #fff3df, #f4a64a, #d95f0b)'
  }
};

export function MapDisplayPanel({
  mode,
  onModeChange,
  warnings = [],
  children
}: {
  mode: MapDisplayMode;
  onModeChange: (mode: MapDisplayMode) => void;
  warnings?: Array<{ code: string; message: string }>;
  children?: React.ReactNode;
}) {
  const userWarnings = visibleUserWarnings(warnings);

  return (
    <aside className="map-help">
      <h2>Карта</h2>

      <fieldset className="map-mode-group">
        <legend>Отображение</legend>
        {displayOptions.map((option) => (
          <label key={option.value} className="map-mode-option">
            <input
              type="radio"
              name="map-display-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => onModeChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <div className="map-legend">
        <h3>Легенда</h3>
        {mode === 'status' ? (
          <div className="map-legend-list">
            {statusLegend.map((item) => (
              <span key={item.label} className="map-legend-item">
                <span className="map-legend-swatch" style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        ) : mode === 'water_percent' || mode === 'field_capacity_percent' || mode === 'minimum_irrigation' ? (
          <div
            className={`map-discrete-legend ${
              mode === 'field_capacity_percent' || mode === 'minimum_irrigation'
                ? 'map-discrete-legend-four'
                : 'map-discrete-legend-five'
            }`}
          >
            {(
              mode === 'water_percent'
                ? waterPercentLegend
                : mode === 'field_capacity_percent'
                  ? fieldCapacityPercentLegend
                  : minimumIrrigationLegend
            ).map((item) => (
              <span key={item.label}>
                <i style={{ background: item.color }} />
                <small>{item.label}</small>
              </span>
            ))}
          </div>
        ) : (
          <div className="map-gradient-legend">
            <span style={{ background: gradientLegend[mode].gradient }} />
            <div>
              <small>{gradientLegend[mode].min}</small>
              <small>{gradientLegend[mode].max}</small>
            </div>
          </div>
        )}
      </div>
      {userWarnings.length > 0 && (
        <div className="diagnostic-warning-list" aria-label="Предупреждения карты">
          {userWarnings.map((warning) => (
            <span key={`${warning.code}-${warning.message}`}>
              <strong>{warning.code}</strong>: {warning.message}
            </span>
          ))}
        </div>
      )}
      {children}
    </aside>
  );
}
