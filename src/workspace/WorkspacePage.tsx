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

  const fieldsQuery = useQuery({
    queryKey: ['field-season-map', state.seasonYear, state.mapDay],
    queryFn: () => kornixApi.getFieldSeasonMap(state.seasonYear, state.mapDay),
    placeholderData: (previousData) => previousData
  });
  const chartFieldSeasonIds = useMemo(() => {
    if (state.tab !== 'chart' || state.fieldSeasonIds.length > 0 || state.fieldsExplicitlyCleared) {
      return state.fieldSeasonIds;
    }

    return fieldsQuery.data?.features.map((feature) => feature.properties.fieldSeasonId) ?? [];
  }, [fieldsQuery.data, state.fieldSeasonIds, state.fieldsExplicitlyCleared, state.tab]);
  const chartSelectionLabel = useMemo(() => {
    if (!fieldsQuery.data || chartFieldSeasonIds.length === 0) {
      return 'на нескольких полях';
    }

    if (chartFieldSeasonIds.length === fieldsQuery.data.features.length) {
      return 'на всех полях';
    }

    if (chartFieldSeasonIds.length === 1) {
      const selectedField = fieldsQuery.data.features.find(
        (feature) => feature.properties.fieldSeasonId === chartFieldSeasonIds[0]
      );
      return `на поле ${selectedField?.properties.fieldKey ?? chartFieldSeasonIds[0]}`;
    }

    return 'на нескольких полях';
  }, [chartFieldSeasonIds, fieldsQuery.data]);

  const updateState = useCallback(
    (patch: Partial<WorkspaceUrlState>, replace = false) => {
      const nextState = { ...state, ...patch };
      const search = serializeWorkspaceState(nextState).toString();
      const pathname = workspacePathForTab(nextState.tab);
      navigate({ pathname, search }, { replace });
    },
    [navigate, state]
  );

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
        'current_water_percent',
        'current_water_mm',
        'available_water_mm',
        'precipitation_mm',
        'actual_irrigation_mm',
        'temperature_sum_from_sowing_c'
      ],
      ...fieldsQuery.data.features.map((feature) => {
        const field = feature.properties;
        return [
          state.mapDay,
          mapDisplayMode,
          field.fieldKey,
          field.fieldName,
          field.areaHa,
          field.cropName,
          field.latestStatus,
          field.currentWaterPercent,
          field.currentWaterMm,
          field.availableWaterMm,
          field.precipitationMm,
          field.actualIrrigationMm,
          field.temperatureSumFromSowingC
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
              {contextQuery.data?.organizationName ?? user?.organizationName ?? 'Хозяйство'} · сезон{' '}
              {state.seasonYear}
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

      {fieldsQuery.isLoading && <div className="empty-state">Загрузка полей…</div>}
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
              fieldSeasonIds={chartFieldSeasonIds}
              selectionLabel={chartSelectionLabel}
              from={state.from}
              to={state.to}
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
          <IrrigationInputTable fields={fieldsQuery.data} seasonYear={state.seasonYear} />
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
    <span className={`readiness readiness-${context.readiness.status}`}>
      готовность: {context.readiness.code} · {context.calculationReadyFieldCount}/{context.fieldCount}
    </span>
  );
}
