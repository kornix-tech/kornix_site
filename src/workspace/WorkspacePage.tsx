import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { kornixApi } from '../api/kornixApi';
import { useAuth } from '../features/auth/AuthProvider';
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

export function WorkspacePage() {
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [searchParams] = useSearchParams();
  const [mapDisplayMode, setMapDisplayMode] = useState<MapDisplayMode>('status');
  const [chartCsv, setChartCsv] = useState<string | null>(null);
  const location = useLocation();
  const state = useMemo(
    () => parseWorkspaceState(searchParams, location.pathname),
    [location.pathname, searchParams]
  );
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const canonicalPath = workspacePathForTab(state.tab);
  const canonicalSearch = serializeWorkspaceState(state).toString();

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
    import.meta.env.VITE_ENABLE_MOCK_API === 'true' ? 'mock-sp-2026-initial' : null;
  const activeCalculationRunId =
    state.calculationRunId ?? contextQuery.data?.latestCalculationRunId ?? mockCalculationRunId;

  const fieldsQuery = useQuery({
    queryKey: ['field-season-map', activeCalculationRunId, state.mapDay],
    enabled: Boolean(activeCalculationRunId),
    queryFn: () =>
      kornixApi.getFieldSeasonMap({
        calculationRunId: activeCalculationRunId ?? '',
        day: state.mapDay
      }),
    placeholderData: (previousData) => previousData
  });
  const chartFieldSeasonIds = useMemo(() => {
    const availableFieldSeasonIds = new Set(
      fieldsQuery.data?.features.map((feature) => feature.properties.fieldSeasonId) ?? []
    );

    if (state.tab !== 'chart' || state.fieldsExplicitlyCleared) {
      return state.fieldSeasonIds.filter((fieldSeasonId) => availableFieldSeasonIds.has(fieldSeasonId));
    }

    if (state.fieldSeasonIds.length > 0) {
      return state.fieldSeasonIds.filter((fieldSeasonId) => availableFieldSeasonIds.has(fieldSeasonId));
    }

    return fieldsQuery.data?.features.map((feature) => feature.properties.fieldSeasonId) ?? [];
  }, [fieldsQuery.data, state.fieldSeasonIds, state.fieldsExplicitlyCleared, state.tab]);
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
    if (!fieldsQuery.data) {
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
      ...fieldsQuery.data.features.map((feature) => {
        const field = feature.properties;
        const derived = deriveWaterMetrics(field);
        return [
          state.mapDay,
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

    downloadCsv(`kornix-map-${state.mapDay}-${mapDisplayMode}`, rows);
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
              onClick={() => updateState({ tab: 'map', mapDay: DEFAULT_WORKSPACE_STATE.mapDay })}
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

      {!activeCalculationRunId && (
        <div className="empty-state">Нет расчёта. Утвердите поливы, чтобы получить calculationRunId.</div>
      )}
      {activeCalculationRunId && fieldsQuery.isLoading && <div className="empty-state">Загрузка полей…</div>}
      {fieldsQuery.isError && <div className="error-state">Не удалось загрузить карту полей.</div>}

      {fieldsQuery.data && state.tab === 'map' && (
        <section className="map-layout">
          <div className="map-main">
            <Suspense fallback={<div className="empty-state">Загрузка карты…</div>}>
              <FieldMap
                fields={fieldsQuery.data}
                mode={mapDisplayMode}
                selectedFieldSeasonIds={state.fieldSeasonIds}
                onSelectField={selectFieldFromMap}
              />
            </Suspense>
            <MapTimeRuler
              day={state.mapDay}
              onChange={(mapDay) => updateState({ mapDay }, true)}
            />
          </div>
          <MapDisplayPanel mode={mapDisplayMode} onModeChange={setMapDisplayMode}>
            <ExportActions onExportGraphics={handleExportGraphics} onExportData={handleExportMapData} />
          </MapDisplayPanel>
        </section>
      )}

      {fieldsQuery.data && state.tab === 'chart' && (
        <section className="chart-layout">
          <FieldSelectorPanel
            fields={fieldsQuery.data}
            selectedFieldSeasonIds={chartFieldSeasonIds}
            onChange={(fieldSeasonIds) =>
              updateState({ fieldSeasonIds, fieldsExplicitlyCleared: fieldSeasonIds.length === 0 })
            }
          />
          <Suspense fallback={<div className="chart-panel empty-state">Загрузка графика…</div>}>
            <WaterRegimeChart
              fields={fieldsQuery.data.features}
              fieldSeasonIds={chartFieldSeasonIds}
              from={state.from}
              to={state.to}
              calculationRunId={activeCalculationRunId}
              onFromChange={(from) => updateState({ from })}
              onToChange={(to) => updateState({ to })}
              onCsvChange={setChartCsv}
              onExportGraphics={handleExportGraphics}
              onExportData={handleExportChartData}
            />
          </Suspense>
        </section>
      )}

      {fieldsQuery.data && state.tab === 'irrigation' && (
        <Suspense fallback={<div className="irrigation-panel empty-state">Загрузка таблицы поливов…</div>}>
          <IrrigationInputTable
            fields={fieldsQuery.data}
            seasonYear={state.seasonYear}
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
