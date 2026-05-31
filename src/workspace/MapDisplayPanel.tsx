import type { MapDisplayMode } from './FieldMap';

type LegendItem = {
  label: string;
  color: string;
};

const displayOptions: Array<{ value: MapDisplayMode; label: string }> = [
  { value: 'status', label: 'Сводная метрика' },
  { value: 'water_percent', label: 'Доля продуктивных влагозапасов' },
  { value: 'precipitation', label: 'Сумма выпавших осадков' },
  { value: 'irrigation', label: 'Сумма поливов' },
  { value: 'temperature_sum', label: 'Сумма температур от даты сева' }
];

const statusLegend: LegendItem[] = [
  { label: 'Норма', color: '#4caf50' },
  { label: 'Внимание', color: '#ffc107' },
  { label: 'Критично', color: '#e53935' },
  { label: 'Нет расчёта', color: '#b0b4b8' }
];

const gradientLegend: Record<Exclude<MapDisplayMode, 'status'>, { min: string; max: string; gradient: string }> = {
  water_percent: {
    min: 'мало',
    max: 'много',
    gradient: 'linear-gradient(90deg, #d95745, #f0c84b, #2f8f46)'
  },
  precipitation: {
    min: '0 мм',
    max: 'больше',
    gradient: 'linear-gradient(90deg, #eaf8ff, #68c5f4, #0878be)'
  },
  irrigation: {
    min: '0 мм',
    max: 'больше',
    gradient: 'linear-gradient(90deg, #edf4ff, #5d96f2, #174ea6)'
  },
  temperature_sum: {
    min: 'меньше',
    max: 'больше',
    gradient: 'linear-gradient(90deg, #fff3df, #f4a64a, #d95f0b)'
  }
};

export function MapDisplayPanel({
  mode,
  onModeChange,
  children
}: {
  mode: MapDisplayMode;
  onModeChange: (mode: MapDisplayMode) => void;
  children?: React.ReactNode;
}) {
  return (
    <aside className="map-help">
      <h2>Карта</h2>
      <p>Подпись в центре полигона показывает название поля.</p>

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
      {children}
    </aside>
  );
}
