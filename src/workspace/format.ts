export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'нет данных';
  }
  return value.toFixed(digits).replace(/\.0$/, '');
}

export function formatArea(value: number | null | undefined): string {
  return typeof value === 'number' && !Number.isNaN(value) ? `${formatNumber(value, 1)} га` : 'нет данных';
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function todayMinus(days: number): string {
  return offsetIso(todayIso(), -days);
}

export function todayPlus(days: number): string {
  return offsetIso(todayIso(), days);
}

function offsetIso(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
