import { todayIso, todayMinus, todayPlus } from './format';

export type WorkspaceTab = 'map' | 'chart' | 'irrigation';

const MAX_URL_FIELD_IDS = 120;
const FIELD_SEASON_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,96}$/;
const CALCULATION_RUN_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;
const RESERVED_CALCULATION_RUN_IDS = new Set(['catalog']);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type WorkspaceUrlState = {
  tab: WorkspaceTab;
  organizationCode: string;
  seasonYear: number;
  calculationRunId: string | null;
  methodCode: string | null;
  mapDay: string;
  fieldSeasonIds: string[];
  fieldsExplicitlyCleared: boolean;
  from: string;
  to: string;
  aggregation: 'area_weighted_mean';
};

export const DEFAULT_WORKSPACE_STATE: WorkspaceUrlState = {
  tab: 'map',
  organizationCode: 'sp',
  seasonYear: 2026,
  calculationRunId: null,
  methodCode: null,
  mapDay: todayIso(),
  fieldSeasonIds: [],
  fieldsExplicitlyCleared: false,
  from: todayMinus(29),
  to: todayPlus(7),
  aggregation: 'area_weighted_mean'
};

const ORGANIZATION_CODE_PATTERN = /^[a-z0-9-]{1,32}$/;

export function normalizeOrganizationCode(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? '';
  return ORGANIZATION_CODE_PATTERN.test(normalized) ? normalized : DEFAULT_WORKSPACE_STATE.organizationCode;
}

function pathSegmentForTab(tab: WorkspaceTab): string {
  if (tab === 'chart') {
    return 'water-regime';
  }

  if (tab === 'irrigation') {
    return 'irrigation-input';
  }

  return 'fields';
}

export function workspacePathForState(state: Pick<WorkspaceUrlState, 'tab' | 'organizationCode' | 'seasonYear'>): string {
  return `/${pathSegmentForTab(state.tab)}/${normalizeOrganizationCode(state.organizationCode)}/${state.seasonYear}`;
}

function workspacePathParts(pathname: string): Pick<WorkspaceUrlState, 'tab' | 'organizationCode' | 'seasonYear'> {
  const [segment = '', organizationSegment, seasonSegment] = pathname.split('/').filter(Boolean);
  const tab =
    segment === 'water-regime'
      ? 'chart'
      : segment === 'irrigation-input' || segment === 'irrigation'
        ? 'irrigation'
        : segment === 'fields' || segment === 'map' || segment === 'workspace'
          ? 'map'
          : null;
  const seasonYearRaw = Number(seasonSegment);

  return {
    tab: tab ?? DEFAULT_WORKSPACE_STATE.tab,
    organizationCode: normalizeOrganizationCode(organizationSegment),
    seasonYear:
      Number.isFinite(seasonYearRaw) && seasonYearRaw > 2000
        ? seasonYearRaw
        : DEFAULT_WORKSPACE_STATE.seasonYear
  };
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
  const pathState = workspacePathParts(pathname);
  const tabParam = searchParams.get('tab');
  const tab =
    tabParam === 'chart' || tabParam === 'irrigation'
      ? tabParam
      : tabParam === 'map'
        ? 'map'
        : pathState.tab;
  const seasonYearRaw = Number(searchParams.get('season') ?? searchParams.get('seasonYear'));
  const parsedMapDay = normalizedDate(
    searchParams.get('day') || searchParams.get('mapDay'),
    DEFAULT_WORKSPACE_STATE.mapDay
  );
  const fieldsParam = searchParams.get('fields') ?? searchParams.get('fieldSeasonIds') ?? '';
  const calculationRunIdParam = searchParams.get('calculationRunId');
  const methodCodeParam = searchParams.get('methodCode');
  const fieldsExplicitlyCleared = fieldsParam === 'none';
  const fieldSeasonIds = fieldsExplicitlyCleared ? [] : parseFieldSeasonIds(fieldsParam);
  const from = normalizedDate(searchParams.get('from'), DEFAULT_WORKSPACE_STATE.from);
  const to = normalizedDate(searchParams.get('to'), DEFAULT_WORKSPACE_STATE.to);
  const hasValidRange = from <= to;

  return {
    tab,
    organizationCode: pathState.organizationCode,
    seasonYear: Number.isFinite(seasonYearRaw) && seasonYearRaw > 2000 ? seasonYearRaw : pathState.seasonYear,
    calculationRunId:
      calculationRunIdParam &&
      CALCULATION_RUN_ID_PATTERN.test(calculationRunIdParam) &&
      !RESERVED_CALCULATION_RUN_IDS.has(calculationRunIdParam)
        ? calculationRunIdParam
        : null,
    methodCode: methodCodeParam && FIELD_SEASON_ID_PATTERN.test(methodCodeParam) ? methodCodeParam : null,
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
  if (state.methodCode) {
    params.set('methodCode', state.methodCode);
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
