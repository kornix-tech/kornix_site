import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kornixApi } from '../api/kornixApi';
import { ApiError } from '../shared/api/httpClient';
import type {
  FieldSeasonMapFeature,
  FieldSeasonMapFeatureCollection,
  KornixApprovalClientDiffDto,
  KornixApprovalIrrigationCellDto,
  KornixApprovalRequestDto,
  KornixApprovalStatusDto,
  KornixCurrentIrrigationLayerDto,
  KornixCurrentContextDto
} from '../types/kornix';
import { compareFieldKeys, fieldCropLabel, formatFieldKey } from './FieldSelectorPanel';
import { fieldStatusClassName, fieldStatusLabel } from './fieldStatusPresentation';
import { formatArea } from './format';
import { IRRIGATION_LEGEND_SESSION_KEY } from './irrigationUiSession';

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

  const persistValues = useCallback((nextValues: IrrigationValues, shouldPersist = true) => {
    try {
      if (shouldPersist) {
        window.localStorage.setItem(storageKey, JSON.stringify(nextValues));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Локальный draft вспомогательный: backend projection остаётся источником истины.
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

  const replaceValues = useCallback((nextValues: IrrigationValues, shouldPersist = true) => {
    const normalizedValues = normalizeStoredIrrigationValues(nextValues);
    setValues(normalizedValues);
    persistValues(normalizedValues, shouldPersist);
  }, [persistValues]);

  return [values, updateValue, pruneValues, replaceValues] as const;
}

function buildIrrigationLayer(
  values: IrrigationValues,
  managedScope: KornixCurrentContextDto['managedScope'] | null
): KornixApprovalIrrigationCellDto[] {
  const allowedFieldSeasonIds = new Set(managedScope?.fieldSeasonIds ?? []);
  return Object.entries(values)
    .map(([key, value]) => {
      const parsedKey = splitValueKey(key);
      const irrigationMm = Number(value);
      if (
        !parsedKey ||
        !managedScope ||
        parsedKey.day < managedScope.dateFrom ||
        parsedKey.day > managedScope.dateTo ||
        !allowedFieldSeasonIds.has(parsedKey.fieldSeasonId) ||
        !Number.isFinite(irrigationMm) ||
        irrigationMm <= 0
      ) {
        return null;
      }

      return {
        fieldSeasonId: parsedKey.fieldSeasonId,
        irrigationDate: parsedKey.day,
        irrigationMm
      };
    })
    .filter((task): task is NonNullable<typeof task> => task !== null)
    .sort((left, right) =>
      left.fieldSeasonId.localeCompare(right.fieldSeasonId) || left.irrigationDate.localeCompare(right.irrigationDate)
    );
}

function approvalManagedScope(
  managedScope: KornixCurrentContextDto['managedScope']
): KornixCurrentContextDto['managedScope'] {
  // current-context может возвращать служебные поля scope, которые нужны UI,
  // но approval endpoint принимает только строгий DTO без backend-only metadata.
  return {
    dateFrom: managedScope.dateFrom,
    dateTo: managedScope.dateTo,
    fieldSeasonIds: managedScope.fieldSeasonIds,
    scopeVersion: managedScope.scopeVersion
  };
}

function irrigationApprovalSignature(
  values: IrrigationValues,
  managedScope: KornixCurrentContextDto['managedScope'] | null
): string {
  return JSON.stringify(buildIrrigationLayer(values, managedScope));
}

function cellIdentity(cell: KornixApprovalIrrigationCellDto): string {
  return `${cell.fieldSeasonId}:${cell.irrigationDate}`;
}

function buildClientDiff(
  previousLayer: KornixApprovalIrrigationCellDto[],
  nextLayer: KornixApprovalIrrigationCellDto[]
): KornixApprovalClientDiffDto {
  const previousByKey = new Map(previousLayer.map((cell) => [cellIdentity(cell), cell]));
  const nextByKey = new Map(nextLayer.map((cell) => [cellIdentity(cell), cell]));

  return {
    added: nextLayer.filter((cell) => !previousByKey.has(cellIdentity(cell))),
    updated: nextLayer.filter((cell) => {
      const previous = previousByKey.get(cellIdentity(cell));
      return previous !== undefined && previous.irrigationMm !== cell.irrigationMm;
    }),
    deleted: previousLayer.filter((cell) => !nextByKey.has(cellIdentity(cell)))
  };
}

function layerToValues(layer: KornixApprovalIrrigationCellDto[]): IrrigationValues {
  return Object.fromEntries(
    layer
      .filter((cell) => Number.isFinite(cell.irrigationMm) && cell.irrigationMm > 0)
      .map((cell) => [valueKey(cell.fieldSeasonId, cell.irrigationDate), String(cell.irrigationMm)])
  );
}

function layerSignature(layer: KornixApprovalIrrigationCellDto[]): string {
  return JSON.stringify(
    [...layer]
      .filter((cell) => Number.isFinite(cell.irrigationMm) && cell.irrigationMm > 0)
      .sort((left, right) =>
        left.fieldSeasonId.localeCompare(right.fieldSeasonId) ||
        left.irrigationDate.localeCompare(right.irrigationDate)
      )
      .map((cell) => ({
        fieldSeasonId: cell.fieldSeasonId,
        irrigationDate: cell.irrigationDate,
        irrigationMm: cell.irrigationMm
      }))
  );
}

function findOutOfManagedScopeValues(
  values: IrrigationValues,
  managedScope: KornixCurrentContextDto['managedScope'] | null
): string[] {
  if (!managedScope) {
    return Object.keys(values);
  }

  const allowedFieldSeasonIds = new Set(managedScope.fieldSeasonIds);
  return Object.entries(values)
    .filter(([, value]) => normalizeIrrigationInput(value) !== '')
    .map(([key]) => splitValueKey(key))
    .filter(
      (parsedKey): parsedKey is { fieldSeasonId: string; day: string } =>
        parsedKey !== null &&
        (parsedKey.day < managedScope.dateFrom ||
          parsedKey.day > managedScope.dateTo ||
          !allowedFieldSeasonIds.has(parsedKey.fieldSeasonId))
    )
    .map((parsedKey) => `${parsedKey.fieldSeasonId} ${parsedKey.day}`);
}

function calculationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const requestId = error.requestId ? ` · ${error.requestId}` : '';
    return `${error.code}: ${error.message}${requestId}`;
  }

  return error instanceof Error ? error.message : 'Не удалось рассчитать водный режим.';
}

function queryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const requestId = error.requestId ? ` · ${error.requestId}` : '';
    return `${error.code}: ${error.message}${requestId}`;
  }

  return fallback;
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
  context,
  baseCalculationRunId,
  selectedMethodCode,
  onContextRefresh,
  onCalculationComplete
}: {
  fields: FieldSeasonMapFeatureCollection;
  seasonYear: number;
  storageScope: string;
  serverDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  context: KornixCurrentContextDto | null;
  baseCalculationRunId: string | null;
  selectedMethodCode: string | null;
  onContextRefresh: () => Promise<unknown>;
  onCalculationComplete: (calculationRunId: string) => void;
}) {
  const today = serverDate;
  const forecastStart = forecastStartDate;
  const forecastEnd = forecastEndDate;
  const currentWeekStart = isoWeekStart(today);
  const currentWeekEnd = addDaysIso(currentWeekStart, 6);
  const firstDay = `${seasonYear}-04-01`;
  const lastDay = `${seasonYear}-08-31`;
  const editableStart = context?.managedScope.dateFrom ?? firstDay;
  const editableEnd = context?.managedScope.dateTo ?? (forecastEnd < firstDay ? firstDay : forecastEnd);
  const managedFieldSeasonIds = useMemo(
    () => new Set(context?.managedScope.fieldSeasonIds ?? []),
    [context?.managedScope.fieldSeasonIds]
  );
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
  const fieldListScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingIrrigationScrollRef = useRef(false);
  const hydratedProjectionHashRef = useRef<string | null>(null);
  const [values, updateValue, pruneValues, replaceValues] = usePersistentIrrigationValues(seasonYear, storageScope);
  const [isSavingApproval, setIsSavingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [calculationWarnings, setCalculationWarnings] = useState<CalculationWarning[]>([]);
  const [calculationStartedAt, setCalculationStartedAt] = useState<number | null>(null);
  const [elapsedCalculationSeconds, setElapsedCalculationSeconds] = useState(0);
  const [fieldQuery, setFieldQuery] = useState('');
  const [visibleFieldSeasonIds, setVisibleFieldSeasonIds] = useState<string[]>([]);
  const [isLegendVisible, setIsLegendVisible] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.sessionStorage.getItem(IRRIGATION_LEGEND_SESSION_KEY) === 'true';
  });
  const activeLayerQuery = useQuery({
    queryKey: ['current-irrigation-layer', seasonYear, context?.managedScope.scopeVersion],
    enabled: Boolean(context),
    queryFn: () => kornixApi.getCurrentIrrigationLayerV2({ seasonYear }),
    retry: 1
  });
  const backendIrrigationLayer = useMemo(
    () => activeLayerQuery.data?.irrigationLayer ?? [],
    [activeLayerQuery.data?.irrigationLayer]
  );
  const backendProjectionSignature = useMemo(
    () => layerSignature(backendIrrigationLayer),
    [backendIrrigationLayer]
  );
  const allTableFieldSeasonIds = useMemo(
    () => tableFields.map((feature) => feature.properties.fieldSeasonId),
    [tableFields]
  );
  const filteredTableFields = useMemo(() => {
    const needle = fieldQuery.trim().toLowerCase();
    if (!needle) {
      return tableFields;
    }

    return tableFields.filter((feature) => {
      const field = feature.properties;
      return [
        field.fieldName,
        field.fieldKey,
        formatFieldKey(field.fieldKey),
        fieldCropLabel(field)
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [fieldQuery, tableFields]);
  const selectedFieldSeasonIdSet = useMemo(
    () => new Set(visibleFieldSeasonIds),
    [visibleFieldSeasonIds]
  );
  const calendarFields = useMemo(
    () => filteredTableFields.filter((feature) => selectedFieldSeasonIdSet.has(feature.properties.fieldSeasonId)),
    [filteredTableFields, selectedFieldSeasonIdSet]
  );
  const irrigationLayer = useMemo(
    () => buildIrrigationLayer(values, context?.managedScope ?? null),
    [context?.managedScope, values]
  );
  const approvalSignature = useMemo(
    () => irrigationApprovalSignature(values, context?.managedScope ?? null),
    [context?.managedScope, values]
  );
  const approvalState: ApprovalState =
    isSavingApproval
      ? 'saving'
      : approvalError
        ? 'error'
        : backendProjectionSignature === approvalSignature
          ? 'approved'
          : irrigationLayer.length === 0
            ? 'empty'
            : 'dirty';
  const isSubmitBlocked =
    !context ||
    activeLayerQuery.isLoading ||
    activeLayerQuery.isError ||
    context.frontendMode !== 'current_editable' ||
    !context.submitAllowed ||
    !baseCalculationRunId ||
    !selectedMethodCode ||
    isSavingApproval;
  const isInputReadOnly =
    !context || context.frontendMode !== 'current_editable' || !context.submitAllowed;
  const blockedReason =
    (activeLayerQuery.isError ? queryErrorMessage(activeLayerQuery.error, 'Не удалось загрузить активный слой поливов.') : null) ??
    context?.submitBlockedReason ??
    (!baseCalculationRunId
      ? 'Нет опубликованного расчёта для baseCalculationRunId.'
      : !selectedMethodCode
        ? 'Backend не вернул доступный метод расчёта.'
        : null);
  const actualIrrigationCount = irrigationLayer.filter(
    (task) => task.irrigationDate <= today
  ).length;
  const plannedIrrigationCount = irrigationLayer.filter(
    (task) => task.irrigationDate >= forecastStart && task.irrigationDate <= forecastEnd
  ).length;

  useEffect(() => {
    setVisibleFieldSeasonIds((current) => {
      const availableIds = new Set(allTableFieldSeasonIds);
      const retainedIds = current.filter((fieldSeasonId) => availableIds.has(fieldSeasonId));
      return current.length === 0 ? allTableFieldSeasonIds : retainedIds;
    });
  }, [allTableFieldSeasonIds]);

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
        managedFieldSeasonIds.has(parsedKey.fieldSeasonId) &&
        parsedKey.day >= editableStart &&
        parsedKey.day <= editableEnd
      );
    });
  }, [editableEnd, editableStart, managedFieldSeasonIds, pruneValues, tableFields]);

  useEffect(() => {
    if (!activeLayerQuery.data || hydratedProjectionHashRef.current === activeLayerQuery.data.projectionHash) {
      return;
    }

    hydratedProjectionHashRef.current = activeLayerQuery.data.projectionHash;
    replaceValues(layerToValues(activeLayerQuery.data.irrigationLayer), false);
  }, [activeLayerQuery.data, replaceValues]);

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

  useEffect(() => {
    const calendarScroll = tableScrollRef.current;
    const fieldListScroll = fieldListScrollRef.current;
    if (!calendarScroll || !fieldListScroll) {
      return undefined;
    }

    function syncScroll(source: HTMLElement, target: HTMLElement) {
      if (isSyncingIrrigationScrollRef.current) {
        return;
      }

      isSyncingIrrigationScrollRef.current = true;
      target.scrollTop = source.scrollTop;
      window.requestAnimationFrame(() => {
        isSyncingIrrigationScrollRef.current = false;
      });
    }

    const onCalendarScroll = () => syncScroll(calendarScroll, fieldListScroll);
    const onFieldListScroll = () => syncScroll(fieldListScroll, calendarScroll);
    calendarScroll.addEventListener('scroll', onCalendarScroll, { passive: true });
    fieldListScroll.addEventListener('scroll', onFieldListScroll, { passive: true });

    return () => {
      calendarScroll.removeEventListener('scroll', onCalendarScroll);
      fieldListScroll.removeEventListener('scroll', onFieldListScroll);
    };
  }, []);

  async function approveIrrigationEvents() {
    if (isSubmitBlocked || !context || !baseCalculationRunId) {
      setApprovalError(blockedReason ? String(blockedReason) : 'Утверждение сейчас недоступно.');
      return;
    }

    const outOfScopeValues = findOutOfManagedScopeValues(values, context.managedScope);
    if (outOfScopeValues.length > 0) {
      setApprovalError(`Есть значения вне managedScope: ${outOfScopeValues.slice(0, 3).join(', ')}`);
      return;
    }

    if (!irrigationLayer.every((cell) => cell.irrigationMm > 0)) {
      setApprovalError('Полив должен быть положительным числом больше 0 мм.');
      return;
    }

    setIsSavingApproval(true);
    setCalculationStartedAt(Date.now());
    setApprovalError(null);
    setCalculationWarnings([]);
    try {
      const request: KornixApprovalRequestDto = {
        seasonYear,
        baseCalculationRunId,
        approvalClientGeneratedAt: new Date().toISOString(),
        managedScope: approvalManagedScope(context.managedScope),
        irrigationLayer,
        clientDiff: buildClientDiff(backendIrrigationLayer, irrigationLayer)
      };
      const response = await kornixApi.submitWaterRegimeApprovalV2(request);
      setCalculationWarnings(response.warnings ?? []);

      if (response.approvalStatus === 'calculation_failed' || response.calculationStatus === 'failed') {
        const warningsText = response.warnings?.length
          ? response.warnings.map((warning) => `${warning.code}: ${warning.message}`).join('; ')
          : 'Backend вернул failed без warning details.';

        throw new Error(
          `Расчёт KORNIX завершился со статусом failed. calculationRunId=${response.calculationRunId}. ${warningsText}`
        );
      }

      if (response.pollRequired) {
        const status = await pollApprovalUntilFinal(response.approvalBatchId, response.pollAfterMs);
        setCalculationWarnings((current) => [...current, ...(status.warnings ?? [])]);
        if (status.approvalStatus === 'applied' && status.resultAvailable && status.calculationRunId) {
          replaceValues(layerToValues(irrigationLayer), false);
          void activeLayerQuery.refetch();
          onCalculationComplete(status.calculationRunId);
          return;
        }

        if (status.approvalStatus === 'calculation_failed') {
          const errorText = status.error ? `${status.error.code}: ${status.error.message}` : 'Расчёт завершился ошибкой.';
          throw new Error(errorText);
        }

        throw new Error(`Утверждение завершилось статусом ${status.approvalStatus}.`);
      }

      replaceValues(layerToValues(irrigationLayer), false);
      void activeLayerQuery.refetch();
      if (response.calculationRunId) {
        onCalculationComplete(response.calculationRunId);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'BASE_CALCULATION_RUN_IS_NOT_CURRENT_APPLIED') {
        await onContextRefresh();
        setApprovalError(
          `${calculationErrorMessage(error)}. Контекст обновлён, пользовательские правки сохранены как draft; повторите утверждение с новым baseCalculationRunId.`
        );
        return;
      }

      setApprovalError(calculationErrorMessage(error));
    } finally {
      setIsSavingApproval(false);
      setCalculationStartedAt(null);
    }
  }

  async function pollApprovalUntilFinal(
    approvalBatchId: string,
    pollAfterMs = 1500
  ): Promise<KornixApprovalStatusDto> {
    let nextDelayMs = Math.max(500, pollAfterMs);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, nextDelayMs));
      const status = await kornixApi.getApprovalStatusV2(approvalBatchId);
      if (!status.pollRequired || status.approvalStatus !== 'pending_calculation') {
        return status;
      }
      nextDelayMs = Math.min(5000, Math.max(500, nextDelayMs));
    }

    throw new Error('Backend долго рассчитывает водный режим. Повторите проверку статуса позже.');
  }

  function changeIrrigationValue(key: string, value: string) {
    setApprovalError(null);
    setCalculationWarnings([]);
    updateValue(key, value);
  }

  function changeLegendVisibility(isVisible: boolean) {
    setIsLegendVisible(isVisible);
    window.sessionStorage.setItem(IRRIGATION_LEGEND_SESSION_KEY, String(isVisible));
  }

  function toggleVisibleField(fieldSeasonId: string) {
    setVisibleFieldSeasonIds((current) =>
      current.includes(fieldSeasonId)
        ? current.filter((selectedFieldSeasonId) => selectedFieldSeasonId !== fieldSeasonId)
        : [...current, fieldSeasonId]
    );
  }

  return (
    <section className="irrigation-panel">
      <div className="irrigation-toolbar">
        <div className="irrigation-legend">
          <input
            type="checkbox"
            aria-label="Показать легенду поливов"
            checked={isLegendVisible}
            onChange={(event) => changeLegendVisibility(event.target.checked)}
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
            <span>
              редактируемый диапазон {formatDayShort(editableStart)} - {formatDayShort(editableEnd)}
            </span>
            {activeLayerQuery.isLoading && (
              <span className="irrigation-calculation-status">загружаем активный слой поливов</span>
            )}
            {isSavingApproval && (
              <span className="irrigation-calculation-status">
                KORNIX рассчитывает водный режим · {elapsedCalculationSeconds} с
              </span>
            )}
            {approvalError && <span className="irrigation-approval-error">{approvalError}</span>}
            {blockedReason && <span className="irrigation-approval-error">{String(blockedReason)}</span>}
          </div>
          <button
            type="button"
            className={`irrigation-approve-button irrigation-approve-${approvalState}`}
            disabled={isSubmitBlocked}
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

      {activeLayerQuery.isError && (
        <div className="error-state">
          {queryErrorMessage(activeLayerQuery.error, 'Не удалось загрузить активный слой поливов.')}
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

      <div className="irrigation-workbench">
        <aside className="field-selector irrigation-field-selector">
          <div className="panel-header">
            <h2>Поля</h2>
            <span>{visibleFieldSeasonIds.length} выбрано</span>
          </div>

          <input
            className="text-input"
            type="search"
            value={fieldQuery}
            placeholder="Поиск поля"
            onChange={(event) => setFieldQuery(event.target.value)}
          />

          <div className="selector-actions">
            <button type="button" onClick={() => setVisibleFieldSeasonIds(allTableFieldSeasonIds)}>
              Выбрать все
            </button>
            <button type="button" onClick={() => setVisibleFieldSeasonIds([])}>
              Снять
            </button>
          </div>

          <div className="field-list" ref={fieldListScrollRef}>
            {filteredTableFields.map((feature) => {
              const field = feature.properties;
              const displayFieldKey = formatFieldKey(field.fieldKey);
              const isSelected = visibleFieldSeasonIds.includes(field.fieldSeasonId);
              return (
                <label
                  key={field.fieldSeasonId}
                  className={`field-list-item field-status-card ${fieldStatusClassName(field.latestStatus)}`}
                  data-status-label={fieldStatusLabel(field.latestStatus)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleVisibleField(field.fieldSeasonId)}
                  />
                  <span className="field-list-main">
                    <span className="field-list-title">{displayFieldKey}</span>
                    <span className="field-list-meta">
                      {formatArea(field.areaHa)} · {fieldCropLabel(field)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </aside>

        <div className="irrigation-table-scroll" ref={tableScrollRef}>
          <table className="irrigation-table">
            <thead>
              <tr>
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
                      day < editableStart || day > editableEnd ? 'irrigation-locked-day-head' : '',
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
              {calendarFields.map((feature) => {
                const field = feature.properties;
                return (
                  <tr key={field.fieldSeasonId}>
                    {days.map((day) => {
                    const key = valueKey(field.fieldSeasonId, day);
                    const isLockedDay =
                      day < editableStart || day > editableEnd || !managedFieldSeasonIds.has(field.fieldSeasonId);
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
                            disabled={isLockedDay || isInputReadOnly}
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
                              disabled={isLockedDay || isInputReadOnly}
                              onClick={() => changeIrrigationValue(key, nextSteppedValue(value, 1))}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={isLockedDay || isInputReadOnly}
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
      </div>
    </section>
  );
}
