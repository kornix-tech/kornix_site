import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { kornixApi } from '../api/kornixApi';
import { useAuth } from '../features/auth/AuthProvider';
import { ApiError } from '../shared/api/httpClient';
import type { FieldSeasonMapFeatureCollection } from '../types/kornix';
import type { MapDisplayMode } from './FieldMap';
import { ExportActions } from './ExportActions';
import { FieldSelectorPanel, type FieldMoistureZoneCode } from './FieldSelectorPanel';
import { MapDisplayPanel } from './MapDisplayPanel';
import { MapTimeRuler } from './MapTimeRuler';
import { buildCsv, downloadCsv, downloadPagePng } from './exportUtils';
import { IRRIGATION_LEGEND_SESSION_KEY } from './irrigationUiSession';
import { isServiceWarningCode, visibleUserWarnings } from './warningPresentation';
import {
  DEFAULT_WORKSPACE_STATE,
  normalizeOrganizationCode,
  parseWorkspaceState,
  serializeWorkspaceState,
  workspacePathForState,
  type WorkspaceUrlState
} from './workspaceUrlState';
import { deriveWaterMetrics } from '../features/water-regime/derivedWaterMetrics';

const FieldMap = lazy(() => import('./FieldMap').then((module) => ({ default: module.FieldMap })));
const WaterRegimeChart = lazy(() =>
  import('./WaterRegimeChart').then((module) => ({ default: module.WaterRegimeChart }))
);
const IrrigationInputTable = lazy(() =>
  import('./IrrigationInputTable').then((module) => ({ default: module.IrrigationInputTable }))
);
const RESERVED_CALCULATION_RUN_IDS = new Set(['catalog']);
const DEFAULT_FIELD_REGULATION_RANGE = { min: 0.6, max: 0.9 };

function storedFieldRegulationRange(storageScope: string): { min: number; max: number } {
  if (typeof window === 'undefined') {
    return DEFAULT_FIELD_REGULATION_RANGE;
  }

  try {
    const raw = window.localStorage.getItem(`kornix-water-regime-regulation-range:${storageScope}`);
    const parsed = raw ? (JSON.parse(raw) as Partial<{ min: number; max: number }>) : null;
    const min = typeof parsed?.min === 'number' && Number.isFinite(parsed.min) ? parsed.min : DEFAULT_FIELD_REGULATION_RANGE.min;
    const max = typeof parsed?.max === 'number' && Number.isFinite(parsed.max) ? parsed.max : DEFAULT_FIELD_REGULATION_RANGE.max;
    return {
      min: Math.max(0, Math.min(1, min)),
      max: Math.max(0, Math.min(1, max))
    };
  } catch {
    return DEFAULT_FIELD_REGULATION_RANGE;
  }
}

function fieldMoistureZoneAtForecastEnd(
  field: FieldSeasonMapFeatureCollection['features'][number]['properties'],
  regulationRange: { min: number; max: number }
): FieldMoistureZoneCode {
  const fieldCapacity = field.soil_field_capacity_water_mm;
  const wiltingPoint = field.soil_wilting_point_capacity_water_mm;
  const water = field.soil_water_end_mm ?? field.soil_water_content_mm;

  if (
    typeof fieldCapacity !== 'number' ||
    typeof wiltingPoint !== 'number' ||
    typeof water !== 'number' ||
    !Number.isFinite(fieldCapacity) ||
    !Number.isFinite(wiltingPoint) ||
    !Number.isFinite(water)
  ) {
    return 'no_data';
  }

  if (water < wiltingPoint) {
    return 'wilting_stress';
  }

  const lower = fieldCapacity * regulationRange.min;
  const upper = fieldCapacity * regulationRange.max;
  if (water > upper) {
    return 'upper_warning';
  }
  if (water >= lower) {
    return 'regulation';
  }

  return 'lower_warning';
}

export function WorkspacePage() {
  const mapGraphicsRef = useRef<HTMLDivElement | null>(null);
  const [searchParams] = useSearchParams();
  const [mapDisplayMode, setMapDisplayMode] = useState<MapDisplayMode>('status');
  const [chartCsv, setChartCsv] = useState<string | null>(null);
  const autoDateRangeRef = useRef<string | null>(null);
  const location = useLocation();
  const state = useMemo(
    () => parseWorkspaceState(searchParams, location.pathname),
    [location.pathname, searchParams]
  );
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const contextQuery = useQuery({
    queryKey: ['kornix-current-context', state.seasonYear],
    queryFn: () => kornixApi.getCurrentContext({ seasonYear: state.seasonYear })
  });

  const canonicalOrganizationCode = normalizeOrganizationCode(
    contextQuery.data?.organizationCode ?? user?.organizationCode ?? state.organizationCode
  );
  const canonicalPath = workspacePathForState({ ...state, organizationCode: canonicalOrganizationCode });
  const canonicalSearch = serializeWorkspaceState(state).toString();
  const dateRangeSearchValue = `${searchParams.get('from') ?? ''}:${searchParams.get('to') ?? ''}`;
  const hasDateRangeParams = searchParams.has('from') || searchParams.has('to');

  useEffect(() => {
    const currentSearch = searchParams.toString();

    if (location.pathname !== canonicalPath || currentSearch !== canonicalSearch) {
      navigate(
        {
          pathname: canonicalPath,
          search: canonicalSearch
        },
        { replace: true }
      );
    }
  }, [canonicalPath, canonicalSearch, location.pathname, navigate, searchParams]);

  const activeCalculationRunIdCandidate = contextQuery.data?.currentAppliedCalculationRunId ?? null;
  const activeCalculationRunId =
    activeCalculationRunIdCandidate && !RESERVED_CALCULATION_RUN_IDS.has(activeCalculationRunIdCandidate)
      ? activeCalculationRunIdCandidate
      : null;
  const availableMethods = contextQuery.data?.availableMethods ?? [];
  const defaultMethodCode = contextQuery.data?.defaultMethodCode ?? null;
  const isUrlMethodValid = Boolean(
    state.methodCode && availableMethods.some((method) => method.methodCode === state.methodCode)
  );
  const selectedMethodCode = isUrlMethodValid ? state.methodCode : defaultMethodCode;
  const selectedMethod = availableMethods.find((method) => method.methodCode === selectedMethodCode) ?? null;
  const serverDate = contextQuery.data?.serverDate ?? DEFAULT_WORKSPACE_STATE.mapDay;
  const forecastStartDate = contextQuery.data?.forecastStartDate ?? DEFAULT_WORKSPACE_STATE.to;
  const forecastEndDate = contextQuery.data?.forecastEndDate ?? DEFAULT_WORKSPACE_STATE.to;
  const localStorageScope = `${contextQuery.data?.organizationCode ?? user?.organizationCode ?? 'unknown'}:${
    user?.id ?? 'anonymous'
  }`;
  const effectiveMapDay =
    state.mapDay === DEFAULT_WORKSPACE_STATE.mapDay && contextQuery.data?.serverDate
      ? contextQuery.data.serverDate
      : state.mapDay;

  const fieldsQuery = useQuery({
    queryKey: ['field-season-map', activeCalculationRunId, selectedMethodCode, effectiveMapDay],
    enabled: Boolean(activeCalculationRunId && selectedMethodCode),
    queryFn: () =>
      kornixApi.getFieldSeasonMap({
        calculationRunId: activeCalculationRunId ?? '',
        methodCode: selectedMethodCode ?? '',
        day: effectiveMapDay
      }),
    placeholderData: (previousData) => previousData
  });
  const forecastFieldsQuery = useQuery({
    queryKey: ['field-season-map-forecast-end', activeCalculationRunId, selectedMethodCode, forecastEndDate],
    enabled: Boolean(activeCalculationRunId && selectedMethodCode),
    queryFn: () =>
      kornixApi.getFieldSeasonMap({
        calculationRunId: activeCalculationRunId ?? '',
        methodCode: selectedMethodCode ?? '',
        day: forecastEndDate
      }),
    placeholderData: (previousData) => previousData
  });
  const catalogQuery = useQuery({
    queryKey: ['field-season-catalog', state.seasonYear],
    enabled: Boolean(contextQuery.data && !activeCalculationRunId),
    queryFn: () => kornixApi.getFieldSeasonCatalog({ seasonYear: state.seasonYear }),
    retry: 1
  });
  const calculatedFields = activeCalculationRunId ? fieldsQuery.data : undefined;
  const workspaceFields = calculatedFields ?? catalogQuery.data;
  const forecastMoistureZoneByFieldSeasonId = useMemo(() => {
    if (!forecastFieldsQuery.data) {
      return undefined;
    }

    const regulationRange = storedFieldRegulationRange(localStorageScope);
    return new Map(
      forecastFieldsQuery.data.features.map((feature) => [
        feature.properties.fieldSeasonId,
        fieldMoistureZoneAtForecastEnd(feature.properties, regulationRange)
      ])
    );
  }, [forecastFieldsQuery.data, localStorageScope]);
  const currentMoistureZoneByFieldSeasonId = useMemo(() => {
    if (!calculatedFields) {
      return undefined;
    }

    const regulationRange = storedFieldRegulationRange(localStorageScope);
    return new Map(
      calculatedFields.features.map((feature) => [
        feature.properties.fieldSeasonId,
        fieldMoistureZoneAtForecastEnd(feature.properties, regulationRange)
      ])
    );
  }, [calculatedFields, localStorageScope]);
  const chartFieldSeasonIds = useMemo(() => {
    const availableFieldSeasonIds = new Set(
      workspaceFields?.features.map((feature) => feature.properties.fieldSeasonId) ?? []
    );

    if (state.tab !== 'chart' || state.fieldsExplicitlyCleared) {
      return state.fieldSeasonIds.filter((fieldSeasonId) => availableFieldSeasonIds.has(fieldSeasonId));
    }

    if (state.fieldSeasonIds.length > 0) {
      return state.fieldSeasonIds.filter((fieldSeasonId) => availableFieldSeasonIds.has(fieldSeasonId));
    }

    return workspaceFields?.features.map((feature) => feature.properties.fieldSeasonId) ?? [];
  }, [workspaceFields, state.fieldSeasonIds, state.fieldsExplicitlyCleared, state.tab]);
  const updateState = useCallback(
    (patch: Partial<WorkspaceUrlState>, replace = false) => {
      const nextState = { ...state, ...patch };
      const search = serializeWorkspaceState(nextState).toString();
      const pathname = workspacePathForState({
        ...nextState,
        organizationCode: canonicalOrganizationCode
      });
      navigate({ pathname, search }, { replace });
    },
    [canonicalOrganizationCode, navigate, state]
  );

  useEffect(() => {
    const nextPatch: Partial<WorkspaceUrlState> = {};
    if (contextQuery.data && state.methodCode !== selectedMethodCode) {
      nextPatch.methodCode = selectedMethodCode;
    }
    if (Object.keys(nextPatch).length > 0) {
      updateState(nextPatch, true);
    }
  }, [contextQuery.data, selectedMethodCode, state.methodCode, updateState]);

  useEffect(() => {
    const context = contextQuery.data;
    const hasManualDateRange = hasDateRangeParams && autoDateRangeRef.current !== dateRangeSearchValue;
    if (!context || hasManualDateRange) {
      return;
    }

    const nextFrom = context.calculationWindow.from;
    const nextTo = context.calculationWindow.to || context.forecastEndDate;
    if (state.from !== nextFrom || state.to !== nextTo) {
      autoDateRangeRef.current = `${nextFrom}:${nextTo}`;
      updateState({ from: nextFrom, to: nextTo }, true);
    }
  }, [contextQuery.data, dateRangeSearchValue, hasDateRangeParams, state.from, state.to, updateState]);

  useEffect(() => {
    if (!contextQuery.data && !contextQuery.isLoading) {
      console.warn('KORNIX backend dates are unavailable; frontend uses Moscow-date fallback.');
    }
  }, [contextQuery.data, contextQuery.isLoading]);

  const selectFieldFromMap = useCallback(
    (fieldSeasonId: string) => {
      updateState({ tab: 'chart', fieldSeasonIds: [fieldSeasonId], fieldsExplicitlyCleared: false });
    },
    [updateState]
  );

  async function handleLogout() {
    window.sessionStorage.removeItem(IRRIGATION_LEGEND_SESSION_KEY);
    await logout();
    navigate('/login', { replace: true });
  }

  async function handleExportMapGraphics() {
    if (!mapGraphicsRef.current) {
      return;
    }

    await downloadPagePng(mapGraphicsRef.current, `kornix-map-${effectiveMapDay}-${mapDisplayMode}`);
  }

  function handleExportMapData() {
    if (!calculatedFields) {
      return;
    }

    const rows = buildCsv([
      [
        'day',
        'method_code',
        'method_label',
        'display_mode',
        'field_key',
        'field_name',
        'area_ha',
        'crop',
        'status',
        'available_water_fraction_pct',
        'soil_water_content_mm',
        'soil_field_capacity_water_mm',
        'soil_wilting_point_capacity_water_mm',
        'precipitation_effective_daily_mm',
        'irrigation_effective_daily_mm',
        'soil_water_end_mm',
        'soil_water_available_pct_taw',
        'root_zone_depth_m',
        'water_stress_coefficient',
        'crop_stage_code',
        'effective_precipitation_daily_mm',
        'effective_irrigation_daily_mm',
        'drainage_runoff_daily_mm',
        'positive_temperature_sum_from_sowing_c',
        'recommended_irrigation_date',
        'recommended_irrigation_mm'
      ],
      ...calculatedFields.features.map((feature) => {
        const field = feature.properties;
        const derived = deriveWaterMetrics(field);
        return [
          effectiveMapDay,
          selectedMethodCode,
          selectedMethod?.label ?? selectedMethodCode,
          mapDisplayMode,
          field.fieldKey,
          field.fieldName,
          field.areaHa,
          field.cropName,
          field.latestStatus,
          derived.available_water_fraction_pct,
          field.soil_water_content_mm,
          field.soil_field_capacity_water_mm,
          field.soil_wilting_point_capacity_water_mm,
          field.precipitation_effective_daily_mm,
          field.irrigation_effective_daily_mm,
          field.soil_water_end_mm,
          field.soil_water_available_pct_taw,
          field.root_zone_depth_m,
          field.water_stress_coefficient,
          field.crop_stage_code,
          field.effective_precipitation_daily_mm,
          field.effective_irrigation_daily_mm,
          field.drainage_runoff_daily_mm,
          field.positive_temperature_sum_from_sowing_c,
          field.recommended_irrigation_date,
          field.recommended_irrigation_mm
        ];
      })
    ]);

    downloadCsv(`kornix-map-${effectiveMapDay}-${selectedMethodCode ?? 'method'}-${mapDisplayMode}`, rows);
  }

  function handleExportChartData() {
    if (chartCsv) {
      downloadCsv(`kornix-water-regime-${state.from}-${state.to}`, chartCsv);
    }
  }

  return (
    <main className="workspace">
      <header className="workspace-header">
        <div className="header-brand">
          <div className="brand-lockup">
            <span className="brand-mark">
              <img src="/brand/kornix-logo.png" alt="" />
            </span>
            <span>
              <strong>КОРНИКС</strong>
              <small>Технологии</small>
            </span>
          </div>
        </div>

        <div className="header-meta">
          <div className="header-copy">
            <div className="eyebrow">SOFTWARE · DATA · IRRIGATION SYSTEMS</div>
            <h1>Водный режим <span>полей</span></h1>
            <p>
              {contextQuery.data?.organizationName ?? user?.organizationName ?? 'Хозяйство'} · сезон {state.seasonYear}
            </p>
          </div>
          <div className="header-actions">
            <nav className="tabs" aria-label="Разделы рабочего пространства">
              <button
                type="button"
                className={state.tab === 'map' ? 'tab-active' : ''}
                onClick={() => updateState({ tab: 'map', mapDay: serverDate })}
              >
                Карта
              </button>
              <button
                type="button"
                className={state.tab === 'chart' ? 'tab-active' : ''}
                onClick={() => updateState({ tab: 'chart', fieldsExplicitlyCleared: false })}
              >
                Водный режим
              </button>
              <button
                type="button"
                className={state.tab === 'irrigation' ? 'tab-active' : ''}
                onClick={() => updateState({ tab: 'irrigation' })}
              >
                Ввод поливов
              </button>
            </nav>
            <button className="logout-button" type="button" onClick={() => void handleLogout()}>
              Выйти
            </button>
          </div>
        </div>
      </header>

      {!activeCalculationRunId && !workspaceFields && (
        <div className="empty-state">Нет расчёта. Загружаем каталог полей для первого расчёта.</div>
      )}
      {activeCalculationRunId && fieldsQuery.isLoading && <div className="empty-state">Загрузка полей…</div>}
      {!activeCalculationRunId && catalogQuery.isLoading && <div className="empty-state">Загрузка каталога полей…</div>}
      {fieldsQuery.isError && <div className="error-state">{queryErrorMessage(fieldsQuery.error, 'Не удалось загрузить карту полей.')}</div>}
      {catalogQuery.isError && !activeCalculationRunId && (
        <div className="error-state">
          {queryErrorMessage(catalogQuery.error, 'Не удалось загрузить каталог полей для первого расчёта.')}
        </div>
      )}
      {!activeCalculationRunId && state.tab === 'map' && workspaceFields && (
        <div className="empty-state">Карта появится после первого расчёта. Поля для ввода поливов уже загружены из каталога.</div>
      )}
      {!activeCalculationRunId && state.tab === 'chart' && workspaceFields && (
        <div className="empty-state">График водного режима появится после расчёта. Перейдите во вкладку ввода поливов и отправьте сценарий.</div>
      )}

      {activeCalculationRunId && calculatedFields && state.tab === 'map' && (
        <section className="map-layout">
          <div className="map-main">
            <div ref={mapGraphicsRef} className="map-export-frame">
              <Suspense fallback={<div className="empty-state">Загрузка карты…</div>}>
                <FieldMap
                  fields={calculatedFields}
                  mapBounds={contextQuery.data?.mapBounds ?? null}
                  mode={mapDisplayMode}
                  selectedFieldSeasonIds={state.fieldSeasonIds}
                  onSelectField={selectFieldFromMap}
                />
              </Suspense>
            </div>
            <MapTimeRuler
              day={effectiveMapDay}
              serverDate={serverDate}
              forecastStartDate={forecastStartDate}
              forecastEndDate={forecastEndDate}
              onChange={(mapDay) => updateState({ mapDay }, true)}
            />
          </div>
          <MapDisplayPanel
            mode={mapDisplayMode}
            onModeChange={setMapDisplayMode}
            warnings={calculatedFields.warnings ?? []}
          >
            <WorkspaceMethodPanel
              context={contextQuery.data}
              selectedMethodCode={selectedMethodCode}
              invalidUrlMethodCode={state.methodCode && !isUrlMethodValid ? state.methodCode : null}
              onMethodChange={(methodCode) => updateState({ methodCode })}
            />
            <ExportActions onExportGraphics={handleExportMapGraphics} onExportData={handleExportMapData} />
          </MapDisplayPanel>
        </section>
      )}

      {activeCalculationRunId && calculatedFields && state.tab === 'chart' && (
        <section className="chart-layout">
          <FieldSelectorPanel
            fields={calculatedFields}
            currentMoistureZones={currentMoistureZoneByFieldSeasonId}
            forecastMoistureZones={forecastMoistureZoneByFieldSeasonId}
            selectedFieldSeasonIds={chartFieldSeasonIds}
            onChange={(fieldSeasonIds) =>
              updateState({ fieldSeasonIds, fieldsExplicitlyCleared: fieldSeasonIds.length === 0 })
            }
          />
          <Suspense fallback={<div className="chart-panel empty-state">Загрузка графика…</div>}>
            <WaterRegimeChart
              key={localStorageScope}
              fields={calculatedFields.features}
              fieldSeasonIds={chartFieldSeasonIds}
              storageScope={localStorageScope}
              from={state.from}
              to={state.to}
              calculationRunId={activeCalculationRunId}
              methodCode={selectedMethodCode}
              methodLabel={selectedMethod?.label ?? selectedMethodCode ?? 'метод не выбран'}
              serverDate={serverDate}
              forecastStartDate={forecastStartDate}
              forecastEndDate={forecastEndDate}
              onFromChange={(from) => updateState({ from })}
              onToChange={(to) => updateState({ to })}
              onCsvChange={setChartCsv}
              onExportData={handleExportChartData}
            />
          </Suspense>
        </section>
      )}

      {workspaceFields && state.tab === 'irrigation' && (
        <Suspense fallback={<div className="irrigation-panel empty-state">Загрузка таблицы поливов…</div>}>
          <IrrigationInputTable
            key={localStorageScope}
            fields={workspaceFields}
            seasonYear={state.seasonYear}
            storageScope={localStorageScope}
            serverDate={serverDate}
            forecastStartDate={forecastStartDate}
            forecastEndDate={forecastEndDate}
            context={contextQuery.data ?? null}
            baseCalculationRunId={activeCalculationRunId}
            selectedMethodCode={selectedMethodCode}
            currentMoistureZones={currentMoistureZoneByFieldSeasonId}
            forecastMoistureZones={forecastMoistureZoneByFieldSeasonId}
            onContextRefresh={() => contextQuery.refetch()}
            onCalculationComplete={() => {
              void contextQuery.refetch();
            }}
          />
        </Suspense>
      )}
    </main>
  );
}

function WorkspaceMethodPanel({
  context,
  selectedMethodCode,
  invalidUrlMethodCode,
  onMethodChange
}: {
  context: Awaited<ReturnType<typeof kornixApi.getCurrentContext>> | undefined;
  selectedMethodCode: string | null;
  invalidUrlMethodCode: string | null;
  onMethodChange: (methodCode: string) => void;
}) {
  if (!context) {
    return null;
  }

  const warnings = visibleUserWarnings([
    ...(context.warnings ?? []),
    ...(context.readinessSummary.warnings ?? []),
    ...(invalidUrlMethodCode
      ? [
          {
            code: 'INVALID_METHOD_CODE',
            message: `Метод ${invalidUrlMethodCode} недоступен, выбран ${selectedMethodCode ?? context.defaultMethodCode}.`
          }
        ]
      : [])
  ]);
  const shouldShowSubmitBlockedReason = Boolean(
    context.submitBlockedReason && !isServiceWarningCode(context.submitBlockedReason)
  );

  return (
    <div className="workspace-method-panel">
      <label>
        Метод
        <select
          value={selectedMethodCode ?? ''}
          onChange={(event) => onMethodChange(event.target.value)}
          disabled={context.availableMethods.length <= 1}
        >
          {context.availableMethods.map((method) => (
            <option key={method.methodCode} value={method.methodCode}>
              {method.label}
            </option>
          ))}
        </select>
      </label>
      {shouldShowSubmitBlockedReason && (
        <div className="diagnostic-warning-list">
          <span>
            <strong>{context.submitBlockedReason}</strong>: утверждение сейчас заблокировано backend.
          </span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="diagnostic-warning-list" aria-label="Предупреждения контекста KORNIX">
          {warnings.map((warning) => (
            <span key={`${warning.code}-${warning.message}`}>
              <strong>{warning.code}</strong>: {warning.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function queryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const requestId = error.requestId ? ` · ${error.requestId}` : '';
    return `${error.code}: ${error.message}${requestId}`;
  }

  return fallback;
}
