import { KORNIX_METRICS } from '../config/metrics';
import type {
  CurrentUserDto,
  FieldSeasonMapFeatureCollection,
  KornixCurrentContextDto,
  KornixMetricCode,
  SaveIrrigationEventsRequest,
  SaveIrrigationEventsResponse,
  WaterRegimeTimeseriesDto
} from '../types/kornix';
import { mockAuthUser } from '../features/auth/mockAuthClient';
import { requestJson } from '../shared/api/httpClient';
import { buildMockFieldSeasonMapForDay, mockCurrentContext } from './mockData';
import { buildMockTimeseries } from './timeseries';
import { isMockRuntimeAllowed } from '../config/runtimeSafety';

const mockEnabled = import.meta.env.VITE_ENABLE_MOCK_API === 'true' && isMockRuntimeAllowed();

function delay<T>(value: T, ms = 200): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

export const kornixApi = {
  async getMe(): Promise<CurrentUserDto> {
    if (mockEnabled) {
      return delay(mockAuthUser);
    }
    return requestJson<CurrentUserDto>('/api/v1/me');
  },

  async getCurrentContext(): Promise<KornixCurrentContextDto> {
    if (mockEnabled) {
      return delay(mockCurrentContext);
    }
    return requestJson<KornixCurrentContextDto>('/api/v1/kornix/current-context');
  },

  async getFieldSeasonMap(seasonYear: number, day?: string): Promise<FieldSeasonMapFeatureCollection> {
    if (mockEnabled) {
      return delay(buildMockFieldSeasonMapForDay(day));
    }
    const query = new URLSearchParams({ seasonYear: String(seasonYear) });
    if (day) {
      query.set('day', day);
    }
    return requestJson<FieldSeasonMapFeatureCollection>(
      `/api/v1/kornix/field-seasons/map?${query.toString()}`
    );
  },

  async getWaterRegimeTimeseries(params: {
    fieldSeasonIds: string[];
    metric: KornixMetricCode;
    from: string;
    to: string;
    aggregation: 'area_weighted_mean';
  }): Promise<WaterRegimeTimeseriesDto> {
    if (mockEnabled) {
      return delay(
        buildMockTimeseries({
          ...params,
          fields: buildMockFieldSeasonMapForDay()
        })
      );
    }

    const query = new URLSearchParams({
      fieldSeasonIds: params.fieldSeasonIds.join(','),
      metric: params.metric,
      from: params.from,
      to: params.to,
      aggregation: params.aggregation
    });
    return requestJson<WaterRegimeTimeseriesDto>(
      `/api/v1/kornix/water-regime/timeseries?${query.toString()}`
    );
  },

  async saveIrrigationEvents(request: SaveIrrigationEventsRequest): Promise<SaveIrrigationEventsResponse> {
    if (mockEnabled) {
      return delay({
        accepted: true,
        acceptedEventCount: request.events.length,
        recalculationQueued: request.events.length > 0,
        requestId: `mock-irrigation-${Date.now()}`
      });
    }

    return requestJson<SaveIrrigationEventsResponse>('/api/v1/kornix/irrigation-events', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
  },

  metrics: KORNIX_METRICS
};
