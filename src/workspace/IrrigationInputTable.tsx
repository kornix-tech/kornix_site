import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { kornixApi } from '../api/kornixApi';
import { ApiError } from '../shared/api/httpClient';
import type {
  FieldSeasonMapFeature,
  FieldSeasonMapFeatureCollection,
  IrrigationTaskPayloadDto
} from '../types/kornix';
import { compareFieldKeys } from './FieldSelectorPanel';
import { fieldStatusClassName, fieldStatusLabel } from './fieldStatusPresentation';
import { formatArea } from './format';

type IrrigationValues = Record<string, string>;

type DateGroup = {
  key: string;
  label: string;
  span: number;
};

type ApprovalState = 'empty' | 'dirty' | 'approved' | 'saving' | 'error';
type CalculationWarning = { code: string; message: string };

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

function isoWeekStart(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 1 - weekday);
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
  const date = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(date);
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
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
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

  return String(Math.min(120, Math.max(1, parsed + direction)));
}

function usePersistentIrrigationValues(seasonYear: number, storageScope: string) {
  const storageKey = `kornix-irrigation-input:${storageScope}:${seasonYear}`;

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

function useApprovedIrrigationSignature(seasonYear: number, storageScope: string) {
  const storageKey = `kornix-irrigation-approved:${storageScope}:${seasonYear}`;
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

function buildIrrigationTaskPayload(
  values: IrrigationValues,
  editableEnd: string
): IrrigationTaskPayloadDto {
  const irrigationTasks = Object.entries(values)
    .map(([key, value]) => {
      const parsedKey = splitValueKey(key);
      const irrigationTaskMm = Number(value);
      if (!parsedKey || parsedKey.day > editableEnd || !Number.isFinite(irrigationTaskMm) || irrigationTaskMm <= 0) {
        return null;
      }

      return {
        fieldSeasonId: parsedKey.fieldSeasonId,
        irrigationDate: parsedKey.day,
        irrigationTaskMm
      };
    })
    .filter((task): task is NonNullable<typeof task> => task !== null)
    .sort((left, right) =>
      left.fieldSeasonId.localeCompare(right.fieldSeasonId) || left.irrigationDate.localeCompare(right.irrigationDate)
    );

  return {
    generatedAt: new Date().toISOString(),
    irrigation_tasks: irrigationTasks
  };
}

function irrigationApprovalSignature(
  values: IrrigationValues,
  editableEnd: string
): string {
  const payload = buildIrrigationTaskPayload(values, editableEnd);
  return JSON.stringify({
    irrigation_tasks: payload.irrigation_tasks
  });
}

function calculationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const requestId = error.requestId ? ` · ${error.requestId}` : '';
    return `${error.code}: ${error.message}${requestId}`;
  }

  return error instanceof Error ? error.message : 'Не удалось рассчитать водный режим.';
}

function sortedFields(fields: FieldSeasonMapFeatureCollection): FieldSeasonMapFeature[] {
  return [...fields.features].sort((left, right) =>
    compareFieldKeys(left.properties.fieldKey, right.properties.fieldKey)
  );
}

export function IrrigationInputTable({
  fields,
  seasonYear,
  storageScope,
  serverDate,
  forecastStartDate,
  forecastEndDate,
  onCalculationComplete
}: {
  fields: FieldSeasonMapFeatureCollection;
  seasonYear: number;
  storageScope: string;
  serverDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  onCalculationComplete: (calculationRunId: string) => void;
}) {
  const today = serverDate;
  const forecastStart = forecastStartDate;
  const forecastEnd = forecastEndDate;
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
  const [values, updateValue, pruneValues] = usePersistentIrrigationValues(seasonYear, storageScope);
  const [approvedSignature, approveSignature] = useApprovedIrrigationSignature(seasonYear, storageScope);
  const [isSavingApproval, setIsSavingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [calculationWarnings, setCalculationWarnings] = useState<CalculationWarning[]>([]);
  const [calculationStartedAt, setCalculationStartedAt] = useState<number | null>(null);
  const [elapsedCalculationSeconds, setElapsedCalculationSeconds] = useState(0);
  const [isLegendVisible, setIsLegendVisible] = useState(true);
  const irrigationTaskPayload = useMemo(
    () => buildIrrigationTaskPayload(values, editableEnd),
    [editableEnd, values]
  );
  const approvalSignature = useMemo(
    () => irrigationApprovalSignature(values, editableEnd),
    [editableEnd, values]
  );
  const approvalState: ApprovalState =
    isSavingApproval
      ? 'saving'
      : approvalError
        ? 'error'
        : approvedSignature === approvalSignature
          ? 'approved'
          : irrigationTaskPayload.irrigation_tasks.length === 0
            ? 'empty'
            : 'dirty';
  const actualIrrigationCount = irrigationTaskPayload.irrigation_tasks.filter(
    (task) => task.irrigationDate <= today
  ).length;
  const plannedIrrigationCount = irrigationTaskPayload.irrigation_tasks.filter(
    (task) => task.irrigationDate >= forecastStart && task.irrigationDate <= forecastEnd
  ).length;

  useEffect(() => {
    if (!isSavingApproval || calculationStartedAt === null) {
      setElapsedCalculationSeconds(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedCalculationSeconds(Math.max(0, Math.round((Date.now() - calculationStartedAt) / 1000)));
    }, 500);

    return () => window.clearInterval(timer);
  }, [calculationStartedAt, isSavingApproval]);

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
    const tableScrollContainer = scrollContainer;

    function centerTodayColumn() {
      const todayCell = tableScrollContainer.querySelector<HTMLElement>(`[data-irrigation-day="${today}"]`);
      const fieldHead = tableScrollContainer.querySelector<HTMLElement>('.irrigation-field-head');
      if (!todayCell) {
        return;
      }

      const stickyFieldWidth = fieldHead?.offsetWidth ?? 0;
      const calendarViewportWidth = Math.max(0, tableScrollContainer.clientWidth - stickyFieldWidth);
      const targetScrollLeft =
        todayCell.offsetLeft - stickyFieldWidth - calendarViewportWidth / 2 + todayCell.offsetWidth / 2;
      tableScrollContainer.scrollLeft = Math.max(0, targetScrollLeft);
    }

    const frame = window.requestAnimationFrame(centerTodayColumn);
    // Таблица широкая, sticky-колонки и шрифты могут уточнять размеры после первого кадра.
    // Повторяем центрирование короткой серией, чтобы вход на вкладку стабильно показывал текущий день.
    const retryTimers = [120, 500].map((delayMs) => window.setTimeout(centerTodayColumn, delayMs));

    return () => {
      window.cancelAnimationFrame(frame);
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [today, days.length]);

  async function approveIrrigationEvents() {
    if (isSavingApproval) {
      return;
    }

    setIsSavingApproval(true);
    setCalculationStartedAt(Date.now());
    setApprovalError(null);
    setCalculationWarnings([]);
    try {
      const response = await kornixApi.calculateWaterRegime(irrigationTaskPayload);
      if (response.calculationStatus === 'failed') {
        const warningsText = response.warnings?.length
          ? response.warnings.map((warning) => `${warning.code}: ${warning.message}`).join('; ')
          : 'Backend вернул failed без warning details.';

        throw new Error(
          `Расчёт KORNIX завершился со статусом failed. calculationRunId=${response.calculationRunId}. ${warningsText}`
        );
      }

      approveSignature(approvalSignature);
      setCalculationWarnings(response.warnings ?? []);
      onCalculationComplete(response.calculationRunId);
    } catch (error) {
      setApprovalError(calculationErrorMessage(error));
    } finally {
      setIsSavingApproval(false);
      setCalculationStartedAt(null);
    }
  }

  function changeIrrigationValue(key: string, value: string) {
    setApprovalError(null);
    setCalculationWarnings([]);
    updateValue(key, value);
  }

  return (
    <section className="irrigation-panel">
      <div className="irrigation-toolbar">
        <div className="irrigation-legend">
          <input
            type="checkbox"
            aria-label="Показать легенду поливов"
            checked={isLegendVisible}
            onChange={(event) => setIsLegendVisible(event.target.checked)}
          />
          {isLegendVisible && (
            <div className="irrigation-step-legend" aria-label="Легенда глубины полива">
              {IRRIGATION_STEP_LEGEND.map((item) => (
                <span key={`${item.className}-${item.label}`} className={item.className}>
                  {item.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="irrigation-toolbar-main">
          <div className="irrigation-approval-summary">
            <span>
              до {formatDayShort(today)} - {actualIrrigationCount} поливов, план на 7 дней -{' '}
              {plannedIrrigationCount} поливов
            </span>
            {isSavingApproval && (
              <span className="irrigation-calculation-status">
                KORNIX рассчитывает водный режим · {elapsedCalculationSeconds} с
              </span>
            )}
            {approvalError && <span className="irrigation-approval-error">{approvalError}</span>}
          </div>
          <button
            type="button"
            className={`irrigation-approve-button irrigation-approve-${approvalState}`}
            disabled={approvalState === 'saving'}
            onClick={() => void approveIrrigationEvents()}
          >
            Утверждаю
          </button>
        </div>
      </div>

      {isSavingApproval && (
        <div className="irrigation-calculation-progress" role="progressbar" aria-label="Расчёт водного режима">
          <span />
        </div>
      )}

      {calculationWarnings.length > 0 && (
        <div className="diagnostic-warning-list" aria-label="Предупреждения расчёта KORNIX">
          {calculationWarnings.map((warning) => (
            <span key={`${warning.code}-${warning.message}`}>
              <strong>{warning.code}</strong>: {warning.message}
            </span>
          ))}
        </div>
      )}

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
                    day === forecastStart ? 'irrigation-forecast-start' : '',
                    day === today ? 'irrigation-today' : ''
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
                          day === forecastStart ? 'irrigation-forecast-start' : '',
                          day === today ? 'irrigation-today' : ''
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
