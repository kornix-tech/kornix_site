import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { kornixApi } from '../api/kornixApi';
import type { FieldSeasonMapFeature, FieldSeasonMapFeatureCollection } from '../types/kornix';
import { compareFieldKeys } from './FieldSelectorPanel';
import { fieldStatusClassName, fieldStatusLabel } from './fieldStatusPresentation';
import { formatArea, todayIso } from './format';

type IrrigationValues = Record<string, string>;

type DateGroup = {
  key: string;
  label: string;
  span: number;
};

type ApprovalState = 'empty' | 'dirty' | 'approved' | 'saving' | 'error';

const HIGH_ALERT_IRRIGATION_MM = 30;
const IRRIGATION_STEP_LEGEND = [
  { className: 'irrigation-alert-cell', label: '1–3' },
  { className: 'irrigation-depth-4-7', label: '4–7' },
  { className: 'irrigation-depth-8-11', label: '8–11' },
  { className: 'irrigation-depth-12-15', label: '12–15' },
  { className: 'irrigation-depth-16-20', label: '16–20' },
  { className: 'irrigation-depth-20-30', label: '20–30' },
  { className: 'irrigation-alert-cell', label: '>30' }
];
const MONTH_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
];

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

function isoWeekStart(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() + 1 - weekday);
  return localDateIso(date);
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  let current = from;

  while (current <= to) {
    days.push(current);
    current = addDaysIso(current, 1);
  }

  return days;
}

function formatDayShort(day: string): string {
  const [, month, date] = day.split('-');
  return `${date}.${month}`;
}

function monthName(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  return new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date);
}

function isoWeekNumber(day: string): number {
  const date = new Date(`${day}T00:00:00Z`);
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function decadeLabel(day: string): string {
  const [, month, date] = day.split('-');
  const dayOfMonth = Number(date);
  const decade = dayOfMonth <= 10 ? 1 : dayOfMonth <= 20 ? 2 : 3;
  return `${decade} декада ${MONTH_GENITIVE[Number(month) - 1]}`;
}

function isWeekStart(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00`).getDay();
  return weekday === 1;
}

function groupDates(days: string[], getKey: (day: string) => string, getLabel: (day: string) => string): DateGroup[] {
  return days.reduce<DateGroup[]>((groups, day) => {
    const key = getKey(day);
    const last = groups[groups.length - 1];

    if (last?.key === key) {
      last.span += 1;
      return groups;
    }

    groups.push({ key, label: getLabel(day), span: 1 });
    return groups;
  }, []);
}

function valueKey(fieldSeasonId: string, day: string): string {
  return `${fieldSeasonId}:${day}`;
}

function splitValueKey(key: string): { fieldSeasonId: string; day: string } | null {
  const separatorIndex = key.lastIndexOf(':');
  if (separatorIndex <= 0) {
    return null;
  }

  return {
    fieldSeasonId: key.slice(0, separatorIndex),
    day: key.slice(separatorIndex + 1)
  };
}

function normalizeIrrigationInput(value: string): string {
  const normalized = value.replace(',', '.');
  if (normalized === '') {
    return '';
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return '';
  }

  return String(Math.min(120, parsed));
}

function normalizeStoredIrrigationValues(values: IrrigationValues): IrrigationValues {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, normalizeIrrigationInput(value)] as const)
      .filter(([, value]) => value !== '')
  );
}

function irrigationDepthClassName(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 4 || parsed > HIGH_ALERT_IRRIGATION_MM) {
    return '';
  }

  if (parsed <= 7) {
    return 'irrigation-depth-4-7';
  }
  if (parsed <= 11) {
    return 'irrigation-depth-8-11';
  }
  if (parsed <= 15) {
    return 'irrigation-depth-12-15';
  }
  if (parsed <= 20) {
    return 'irrigation-depth-16-20';
  }
  return 'irrigation-depth-20-30';
}

function isAlertIrrigationValue(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0 && (parsed <= 3 || parsed > HIGH_ALERT_IRRIGATION_MM);
}

function nextSteppedValue(currentValue: string, direction: 1 | -1): string {
  const parsed = Number(currentValue);

  if (!Number.isFinite(parsed)) {
    return direction > 0 ? '1' : '';
  }

  if (direction < 0 && parsed <= 1) {
    return '';
  }

  return String(Math.min(120, Math.max(0, parsed + direction)));
}

function usePersistentIrrigationValues(seasonYear: number) {
  const storageKey = `kornix-irrigation-input:${seasonYear}`;

  const persistValues = useCallback((nextValues: IrrigationValues) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextValues));
    } catch {
      // Сохранение в localStorage вспомогательное: ввод должен работать даже при запрете storage.
    }
  }, [storageKey]);

  const [values, setValues] = useState<IrrigationValues>(() => {
    if (typeof window === 'undefined') {
      return {};
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? normalizeStoredIrrigationValues(JSON.parse(raw) as IrrigationValues) : {};
    } catch {
      return {};
    }
  });

  const updateValue = useCallback((key: string, value: string) => {
    setValues((current) => {
      const next = { ...current };
      const normalized = normalizeIrrigationInput(value);

      if (normalized === '') {
        delete next[key];
      } else {
        next[key] = normalized;
      }

      persistValues(next);

      return next;
    });
  }, [persistValues]);

  const pruneValues = useCallback((predicate: (key: string) => boolean) => {
    setValues((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => predicate(key)));
      if (Object.keys(next).length === Object.keys(current).length) {
        return current;
      }

      persistValues(next);
      return next;
    });
  }, [persistValues]);

  return [values, updateValue, pruneValues] as const;
}

function useApprovedIrrigationSignature(seasonYear: number) {
  const storageKey = `kornix-irrigation-approved:${seasonYear}`;
  const [approvedSignature, setApprovedSignature] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(storageKey) ?? '';
  });

  function approve(signature: string) {
    setApprovedSignature(signature);
    try {
      window.localStorage.setItem(storageKey, signature);
    } catch {
      // Утверждение остается в текущей сессии даже если browser storage недоступен.
    }
  }

  return [approvedSignature, approve] as const;
}

function buildIrrigationApprovalRequest(
  values: IrrigationValues,
  seasonYear: number,
  forecastStart: string,
  editableEnd: string
) {
  const events = Object.entries(values)
    .map(([key, value]) => {
      const parsedKey = splitValueKey(key);
      const irrigationMm = Number(value);
      if (!parsedKey || parsedKey.day > editableEnd || !Number.isFinite(irrigationMm) || irrigationMm <= 0) {
        return null;
      }

      return {
        fieldSeasonId: parsedKey.fieldSeasonId,
        day: parsedKey.day,
        irrigationMm,
        periodKind: parsedKey.day >= forecastStart ? ('plan' as const) : ('fact' as const)
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null)
    .sort((left, right) =>
      left.fieldSeasonId.localeCompare(right.fieldSeasonId) || left.day.localeCompare(right.day)
    );

  return {
    seasonYear,
    generatedAt: new Date().toISOString(),
    forecastStart,
    events
  };
}

function irrigationApprovalSignature(
  values: IrrigationValues,
  seasonYear: number,
  forecastStart: string,
  editableEnd: string
): string {
  const request = buildIrrigationApprovalRequest(values, seasonYear, forecastStart, editableEnd);
  return JSON.stringify({
    seasonYear: request.seasonYear,
    forecastStart: request.forecastStart,
    events: request.events
  });
}

function sortedFields(fields: FieldSeasonMapFeatureCollection): FieldSeasonMapFeature[] {
  return [...fields.features].sort((left, right) =>
    compareFieldKeys(left.properties.fieldKey, right.properties.fieldKey)
  );
}

export function IrrigationInputTable({
  fields,
  seasonYear
}: {
  fields: FieldSeasonMapFeatureCollection;
  seasonYear: number;
}) {
  const today = todayIso();
  const forecastStart = addDaysIso(today, 1);
  const forecastEnd = addDaysIso(today, 7);
  const currentWeekStart = isoWeekStart(today);
  const currentWeekEnd = addDaysIso(currentWeekStart, 6);
  const firstDay = `${seasonYear}-04-01`;
  const lastDay = `${seasonYear}-08-31`;
  const editableEnd = forecastEnd < firstDay ? firstDay : forecastEnd;
  const days = useMemo(() => enumerateDays(firstDay, lastDay), [firstDay, lastDay]);
  const monthGroups = useMemo(
    () => groupDates(days, (day) => day.slice(0, 7), monthName),
    [days]
  );
  const weekGroups = useMemo(
    () =>
      groupDates(days, (day) => `${day.slice(0, 4)}-${isoWeekNumber(day)}`, (day) => `${isoWeekNumber(day)} неделя`),
    [days]
  );
  const decadeGroups = useMemo(
    () => groupDates(days, decadeLabel, decadeLabel),
    [days]
  );
  const tableFields = useMemo(() => sortedFields(fields), [fields]);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [values, updateValue, pruneValues] = usePersistentIrrigationValues(seasonYear);
  const [approvedSignature, approveSignature] = useApprovedIrrigationSignature(seasonYear);
  const [isSavingApproval, setIsSavingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const approvalRequest = useMemo(
    () => buildIrrigationApprovalRequest(values, seasonYear, forecastStart, editableEnd),
    [editableEnd, forecastStart, seasonYear, values]
  );
  const approvalSignature = useMemo(
    () => irrigationApprovalSignature(values, seasonYear, forecastStart, editableEnd),
    [editableEnd, forecastStart, seasonYear, values]
  );
  const approvalState: ApprovalState =
    approvalRequest.events.length === 0
      ? 'empty'
      : isSavingApproval
        ? 'saving'
        : approvalError
          ? 'error'
          : approvedSignature === approvalSignature
            ? 'approved'
            : 'dirty';
  const actualIrrigationCount = approvalRequest.events.filter((event) => event.day <= today).length;
  const plannedIrrigationCount = approvalRequest.events.filter(
    (event) => event.day >= forecastStart && event.day <= forecastEnd
  ).length;

  useEffect(() => {
    const fieldIds = new Set(tableFields.map((feature) => feature.properties.fieldSeasonId));
    pruneValues((key) => {
      const parsedKey = splitValueKey(key);
      return (
        parsedKey !== null &&
        fieldIds.has(parsedKey.fieldSeasonId) &&
        parsedKey.day >= firstDay &&
        parsedKey.day <= editableEnd
      );
    });
  }, [editableEnd, firstDay, pruneValues, tableFields]);

  useEffect(() => {
    const scrollContainer = tableScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const todayCell = scrollContainer.querySelector<HTMLElement>(`[data-irrigation-day="${today}"]`);
      const fieldHead = scrollContainer.querySelector<HTMLElement>('.irrigation-field-head');
      if (!todayCell) {
        return;
      }

      const stickyFieldWidth = fieldHead?.offsetWidth ?? 0;
      const calendarViewportWidth = Math.max(0, scrollContainer.clientWidth - stickyFieldWidth);
      const targetScrollLeft =
        todayCell.offsetLeft - stickyFieldWidth - calendarViewportWidth / 2 + todayCell.offsetWidth / 2;
      scrollContainer.scrollLeft = Math.max(0, targetScrollLeft);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [today, days.length]);

  async function approveIrrigationEvents() {
    if (approvalRequest.events.length === 0 || isSavingApproval) {
      return;
    }

    setIsSavingApproval(true);
    setApprovalError(null);
    try {
      await kornixApi.saveIrrigationEvents(approvalRequest);
      approveSignature(approvalSignature);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'Не удалось утвердить поливы.');
    } finally {
      setIsSavingApproval(false);
    }
  }

  function changeIrrigationValue(key: string, value: string) {
    setApprovalError(null);
    updateValue(key, value);
  }

  return (
    <section className="irrigation-panel">
      <div className="irrigation-toolbar">
        <div className="irrigation-legend">
          <div className="irrigation-step-legend" aria-label="Легенда глубины полива">
            {IRRIGATION_STEP_LEGEND.map((item) => (
              <span key={`${item.className}-${item.label}`} className={item.className}>
                {item.label}
              </span>
            ))}
          </div>
        </div>
        <div className="irrigation-toolbar-main">
          <div className="irrigation-approval-summary">
            <span>
              до {formatDayShort(today)} - {actualIrrigationCount} поливов, план на 7 дней -{' '}
              {plannedIrrigationCount} поливов
            </span>
            {approvalError && <span className="irrigation-approval-error">{approvalError}</span>}
          </div>
          <button
            type="button"
            className={`irrigation-approve-button irrigation-approve-${approvalState}`}
            disabled={approvalState === 'empty' || approvalState === 'saving'}
            onClick={() => void approveIrrigationEvents()}
          >
            Утверждаю
          </button>
        </div>
      </div>

      <div className="irrigation-table-scroll" ref={tableScrollRef}>
        <table className="irrigation-table">
          <thead>
            <tr>
              <th className="irrigation-field-head" rowSpan={4}>
                Поля
              </th>
              {monthGroups.map((group) => (
                <th key={group.key} colSpan={group.span} className="irrigation-scale irrigation-month">
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {weekGroups.map((group) => (
                <th key={group.key} colSpan={group.span} className="irrigation-scale">
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {decadeGroups.map((group) => (
                <th key={group.key} colSpan={group.span} className="irrigation-scale irrigation-decade">
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {days.map((day) => (
                <th
                  key={day}
                  data-irrigation-day={day}
                  className={[
                    'irrigation-day-head',
                    day >= currentWeekStart && day <= currentWeekEnd ? 'irrigation-current-week' : '',
                    day >= forecastStart && day <= forecastEnd ? 'irrigation-forecast-week' : '',
                    isWeekStart(day) ? 'irrigation-week-start' : '',
                    day > editableEnd ? 'irrigation-locked-day-head' : '',
                    day === forecastStart ? 'irrigation-forecast-start' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {formatDayShort(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableFields.map((feature) => {
              const field = feature.properties;
              return (
                <tr key={field.fieldSeasonId}>
                  <th
                    className={`irrigation-field-cell field-status-card ${fieldStatusClassName(field.latestStatus)}`}
                    data-status-label={fieldStatusLabel(field.latestStatus)}
                  >
                    <span className="irrigation-field-title">{field.fieldKey}</span>
                    <span className="irrigation-field-meta">
                      {formatArea(field.areaHa)} · {field.cropName ?? 'нет культуры'}
                    </span>
                  </th>
                  {days.map((day) => {
                    const key = valueKey(field.fieldSeasonId, day);
                    const isLockedDay = day > editableEnd;
                    const value = isLockedDay ? '' : (values[key] ?? '');
                    const depthClassName = irrigationDepthClassName(value);
                    return (
                      <td
                        key={key}
                        className={[
                          'irrigation-cell',
                          day >= currentWeekStart && day <= currentWeekEnd ? 'irrigation-current-week' : '',
                          day >= forecastStart && day <= forecastEnd ? 'irrigation-forecast-week' : '',
                          isWeekStart(day) ? 'irrigation-week-start' : '',
                          isLockedDay ? 'irrigation-locked-cell' : '',
                          !isLockedDay && isAlertIrrigationValue(value) ? 'irrigation-alert-cell' : '',
                          !isLockedDay ? depthClassName : '',
                          day >= forecastStart ? 'irrigation-plan-cell' : 'irrigation-fact-cell',
                          day === forecastStart ? 'irrigation-forecast-start' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="irrigation-input-control">
                          <input
                            aria-label={`${field.fieldKey}, ${formatDayShort(day)}, полив мм`}
                            inputMode="decimal"
                            type="text"
                            value={value}
                            disabled={isLockedDay}
                            onChange={(event) => changeIrrigationValue(key, event.target.value)}
                            onBlur={(event) => changeIrrigationValue(key, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                                event.preventDefault();
                                changeIrrigationValue(key, nextSteppedValue(value, event.key === 'ArrowUp' ? 1 : -1));
                              }
                            }}
                          />
                          <span className="irrigation-stepper" aria-hidden="true">
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={isLockedDay}
                              onClick={() => changeIrrigationValue(key, nextSteppedValue(value, 1))}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={isLockedDay}
                              onClick={() => changeIrrigationValue(key, nextSteppedValue(value, -1))}
                            >
                              ▼
                            </button>
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
