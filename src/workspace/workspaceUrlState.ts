import { todayIso, todayMinus } from './format';

export type WorkspaceTab = 'map' | 'chart' | 'irrigation';

const MAX_URL_FIELD_IDS = 120;
const FIELD_SEASON_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,96}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type WorkspaceUrlState = {
  tab: WorkspaceTab;
  seasonYear: number;
  mapDay: string;
  fieldSeasonIds: string[];
  fieldsExplicitlyCleared: boolean;
  from: string;
  to: string;
  aggregation: 'area_weighted_mean';
};

export const DEFAULT_WORKSPACE_STATE: WorkspaceUrlState = {
  tab: 'map',
  seasonYear: 2026,
  mapDay: todayIso(),
  fieldSeasonIds: [],
  fieldsExplicitlyCleared: false,
  from: todayMinus(29),
  to: todayIso(),
  aggregation: 'area_weighted_mean'
};

export function workspacePathForTab(tab: WorkspaceTab): string {
  if (tab === 'chart') {
    return '/water-regime';
  }

  if (tab === 'irrigation') {
    return '/irrigation';
  }

  return '/map';
}

export function tabFromWorkspacePath(pathname: string): WorkspaceTab | null {
  if (pathname === '/water-regime') {
    return 'chart';
  }
  if (pathname === '/irrigation') {
    return 'irrigation';
  }
  if (pathname === '/map') {
    return 'map';
  }
  return null;
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizedDate(value: string | null, fallback: string): string {
  return value && isValidIsoDate(value) ? value : fallback;
}

function parseFieldSeasonIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => FIELD_SEASON_ID_PATTERN.test(item))
    )
  ).slice(0, MAX_URL_FIELD_IDS);
}

export function parseWorkspaceState(searchParams: URLSearchParams, pathname = '/map'): WorkspaceUrlState {
  const tabParam = searchParams.get('tab');
  const tab =
    tabParam === 'chart' || tabParam === 'irrigation'
      ? tabParam
      : tabParam === 'map'
        ? 'map'
        : tabFromWorkspacePath(pathname) ?? 'map';
  const seasonYearRaw = Number(searchParams.get('season') ?? searchParams.get('seasonYear'));
  const parsedMapDay = normalizedDate(
    searchParams.get('day') || searchParams.get('mapDay'),
    DEFAULT_WORKSPACE_STATE.mapDay
  );
  const fieldsParam = searchParams.get('fields') ?? searchParams.get('fieldSeasonIds') ?? '';
  const fieldsExplicitlyCleared = fieldsParam === 'none';
  const fieldSeasonIds = fieldsExplicitlyCleared ? [] : parseFieldSeasonIds(fieldsParam);
  const from = normalizedDate(searchParams.get('from'), DEFAULT_WORKSPACE_STATE.from);
  const to = normalizedDate(searchParams.get('to'), DEFAULT_WORKSPACE_STATE.to);
  const hasValidRange = from <= to;

  return {
    tab,
    seasonYear: Number.isFinite(seasonYearRaw) && seasonYearRaw > 2000 ? seasonYearRaw : 2026,
    mapDay: tab === 'map' ? parsedMapDay : DEFAULT_WORKSPACE_STATE.mapDay,
    fieldSeasonIds,
    fieldsExplicitlyCleared,
    from: hasValidRange ? from : DEFAULT_WORKSPACE_STATE.from,
    to: hasValidRange ? to : DEFAULT_WORKSPACE_STATE.to,
    aggregation: 'area_weighted_mean'
  };
}

export function serializeWorkspaceState(state: WorkspaceUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.seasonYear !== DEFAULT_WORKSPACE_STATE.seasonYear) {
    params.set('season', String(state.seasonYear));
  }
  if (state.tab === 'map' && state.mapDay !== DEFAULT_WORKSPACE_STATE.mapDay) {
    params.set('day', state.mapDay);
  }
  if (state.fieldSeasonIds.length > 0) {
    params.set('fields', state.fieldSeasonIds.join(','));
  } else if (state.tab === 'chart' && state.fieldsExplicitlyCleared) {
    params.set('fields', 'none');
  }
  if (state.from !== DEFAULT_WORKSPACE_STATE.from) {
    params.set('from', state.from);
  }
  if (state.to !== DEFAULT_WORKSPACE_STATE.to) {
    params.set('to', state.to);
  }
  return params;
}
