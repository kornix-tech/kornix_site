import { useEffect, useState } from 'react';

function addDaysIso(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${nextDay}`;
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

export function MapTimeRuler({
  day,
  serverDate,
  forecastStartDate,
  forecastEndDate,
  onChange
}: {
  day: string;
  serverDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  onChange: (day: string) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const from = addDaysIso(serverDate, -29);
  const forecastStart = forecastStartDate;
  const to = forecastEndDate;
  const maxIndex = dayDiff(from, to);
  const selectedIndex = clamp(dayDiff(from, day), 0, maxIndex);
  const selectedDay = addDaysIso(from, selectedIndex);
  const forecastStartIndex = clamp(dayDiff(from, forecastStart), 0, maxIndex);
  const forecastLeft = maxIndex === 0 ? 100 : (forecastStartIndex / maxIndex) * 100;
  const thumbLeft = maxIndex === 0 ? 0 : (selectedIndex / maxIndex) * 100;
  const isForecast = selectedDay >= forecastStart;

  function changeBy(offset: number) {
    setIsPlaying(false);
    onChange(addDaysIso(from, clamp(selectedIndex + offset, 0, maxIndex)));
  }

  function pauseAnimation() {
    setIsPlaying(false);
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
    <div className="map-time-ruler">
      <button
        type="button"
        className="map-time-play"
        aria-label={isPlaying ? 'Остановить анимацию дат' : 'Запустить анимацию дат'}
        onClick={() => setIsPlaying((value) => !value)}
      >
        {isPlaying ? 'Ⅱ' : '▶'}
      </button>
      <button type="button" aria-label="Предыдущий день" onClick={() => changeBy(-1)}>
        ‹
      </button>
      <div className="map-time-track-wrap">
        <div
          className="map-time-label"
          role="button"
          tabIndex={0}
          aria-label="Ползунок даты карты"
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
          aria-label="Дата отображения карты"
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
      <button type="button" aria-label="Следующий день" onClick={() => changeBy(1)}>
        ›
      </button>
    </div>
  );
}
