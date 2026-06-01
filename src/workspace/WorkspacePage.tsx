import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { kornixApi } from '../api/kornixApi';
import { useAuth } from '../features/auth/AuthProvider';
import { isMockRuntimeAllowed } from '../config/runtimeSafety';
import { ApiError } from '../shared/api/httpClient';
import type { MapDisplayMode } from './FieldMap';
import { ExportActions } from './ExportActions';
import { FieldSelectorPanel } from './FieldSelectorPanel';
import { MapDisplayPanel } from './MapDisplayPanel';
import { MapTimeRuler } from './MapTimeRuler';
import { buildCsv, downloadCsv, downloadPagePng } from './exportUtils';
import {
  DEFAULT_WORKSPACE_STATE,
  parseWorkspaceState,
  serializeWorkspaceState,
  workspacePathForTab,
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

export function WorkspacePage() {
  const workspaceRef = useRef<HTMLElement | null>(null);
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
  const canonicalPath = workspacePathForTab(state.tab);
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

  const contextQuery = useQuery({
    queryKey: ['kornix-current-context', state.seasonYear],
    queryFn: () => kornixApi.getCurrentContext()
  });

  const mockCalculationRunId =
    import.meta.env.VITE_ENABLE_MOCK_API === 'true' && isMockRuntimeAllowed() ? 'mock-sp-2026-initial' : null;
  const activeCalculationRunIdCandidate =
    state.calculationRunId ?? contextQuery.data?.latestCalculationRunId ?? mockCalculationRunId;
  const activeCalculationRunId =
    activeCalculationRunIdCandidate && !RESERVED_CALCULATION_RUN_IDS.has(activeCalculationRunIdCandidate)
      ? activeCalculationRunIdCandidate
      : null;
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
    queryKey: ['field-season-map', activeCalculationRunId, effectiveMapDay],
    enabled: Boolean(activeCalculationRunId),
    queryFn: () =>
      kornixApi.getFieldSeasonMap({
        calculationRunId: activeCalculationRunId ?? '',
        day: effectiveMapDay
      }),
    placeholderData: (previousData) => previousData
  });
  const catalogQuery = useQuery({
    queryKey: ['field-season-catalog', state.seasonYear],
    enabled: !activeCalculationRunId,
    queryFn: () => kornixApi.getFieldSeasonCatalog({ seasonYear: state.seasonYear }),
    retry: 1
  });
  const calculatedFields = activeCalculationRunId ? fieldsQuery.data : undefined;
  const workspaceFields = calculatedFields ?? catalogQuery.data;
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
      const pathname = workspacePathForTab(nextState.tab);
      navigate({ pathname, search }, { replace });
    },
    [navigate, state]
  );

  useEffect(() => {
    if (!state.calculationRunId && contextQuery.data?.latestCalculationRunId) {
      updateState({ calculationRunId: contextQuery.data.latestCalculationRunId }, true);
    }
  }, [contextQuery.data?.latestCalculationRunId, state.calculationRunId, updateState]);

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
    await logout();
    navigate('/login', { replace: true });
  }

  async function handleExportGraphics() {
    if (!workspaceRef.current) {
      return;
    }

    await downloadPagePng(workspaceRef.current, `kornix-${state.tab}-${new Date().toISOString().slice(0, 10)}`);
  }

  function handleExportMapData() {
    if (!calculatedFields) {
      return;
    }

    const rows = buildCsv([
      [
        'day',
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
        'positive_temperature_sum_from_sowing_c',
        'recommended_irrigation_date',
        'recommended_irrigation_mm'
      ],
      ...calculatedFields.features.map((feature) => {
        const field = feature.properties;
        const derived = deriveWaterMetrics(field);
        return [
          effectiveMapDay,
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
          field.positive_temperature_sum_from_sowing_c,
          field.recommended_irrigation_date,
          field.recommended_irrigation_mm
        ];
      })
    ]);

    downloadCsv(`kornix-map-${effectiveMapDay}-${mapDisplayMode}`, rows);
  }

  function handleExportChartData() {
    if (chartCsv) {
      downloadCsv(`kornix-water-regime-${state.from}-${state.to}`, chartCsv);
    }
  }

  return (
    <main ref={workspaceRef} className="workspace">
      <header className="workspace-header">
        <div className="header-brand">
          <div className="brand-lockup">
            <span className="brand-mark">
              <img src="/brand/kornix-logo.png" alt="" />
            </span>
            <span>
              <strong>KORNIX</strong>
              <small>water intelligence</small>
            </span>
          </div>
        </div>

        <div className="header-meta">
          <div className="header-copy">
            <div className="eyebrow">SOFTWARE · DATA · IRRIGATION SYSTEMS</div>
            <h1>Водный режим <span>полей</span></h1>
            <p>
              {contextQuery.data?.organizationName ?? user?.organizationName ?? 'Хозяйство'} · сезон {state.seasonYear}
              {activeCalculationRunId ? ` · расчёт ${activeCalculationRunId}` : ''}
            </p>
          </div>
          <div className="header-actions">
            <ReadinessSummary context={contextQuery.data} />
            <button type="button" onClick={() => void handleLogout()}>
              Выйти
            </button>
          </div>
          <nav className="tabs">
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
            <Suspense fallback={<div className="empty-state">Загрузка карты…</div>}>
              <FieldMap
                fields={calculatedFields}
                mode={mapDisplayMode}
                selectedFieldSeasonIds={state.fieldSeasonIds}
                onSelectField={selectFieldFromMap}
              />
            </Suspense>
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
            <ExportActions onExportGraphics={handleExportGraphics} onExportData={handleExportMapData} />
          </MapDisplayPanel>
        </section>
      )}

      {activeCalculationRunId && calculatedFields && state.tab === 'chart' && (
        <section className="chart-layout">
          <FieldSelectorPanel
            fields={calculatedFields}
            selectedFieldSeasonIds={chartFieldSeasonIds}
            onChange={(fieldSeasonIds) =>
              updateState({ fieldSeasonIds, fieldsExplicitlyCleared: fieldSeasonIds.length === 0 })
            }
          />
          <Suspense fallback={<div className="chart-panel empty-state">Загрузка графика…</div>}>
            <WaterRegimeChart
              fields={calculatedFields.features}
              fieldSeasonIds={chartFieldSeasonIds}
              from={state.from}
              to={state.to}
              calculationRunId={activeCalculationRunId}
              serverDate={serverDate}
              forecastStartDate={forecastStartDate}
              forecastEndDate={forecastEndDate}
              onFromChange={(from) => updateState({ from })}
              onToChange={(to) => updateState({ to })}
              onCsvChange={setChartCsv}
              onExportGraphics={handleExportGraphics}
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
            onCalculationComplete={(calculationRunId) => {
              updateState({ calculationRunId }, true);
              void contextQuery.refetch();
            }}
          />
        </Suspense>
      )}
    </main>
  );
}

function ReadinessSummary({ context }: { context: Awaited<ReturnType<typeof kornixApi.getCurrentContext>> | undefined }) {
  if (!context) {
    return <span className="readiness readiness-unknown">готовность: загрузка</span>;
  }

  return (
    <span className={`readiness readiness-${context.latestCalculationStatus}`}>
      расчёт: {context.latestCalculationStatus} · {context.irrigatedFieldCount2026}/{context.fieldCount}
    </span>
  );
}

function queryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const requestId = error.requestId ? ` · ${error.requestId}` : '';
    return `${error.code}: ${error.message}${requestId}`;
  }

  return fallback;
}
