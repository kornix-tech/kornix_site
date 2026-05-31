import { KORNIX_METRICS } from '../config/metrics';
import { isMockRuntimeAllowed } from '../config/runtimeSafety';
import { mockAuthUser } from '../features/auth/mockAuthClient';
import { requestJson } from '../shared/api/httpClient';
import type {
  CalculationRunId,
  CurrentUserDto,
  FieldSeasonMapFeatureCollection,
  IrrigationTaskPayloadDto,
  KornixCalculateRequest,
  KornixCalculateResponse,
  KornixCurrentContextDto,
  KornixProfileTimeseriesDto
} from '../types/kornix';
import {
  buildMockCalculateResponse,
  buildMockFieldSeasonMapForDay,
  getMockCurrentContext,
  MOCK_INITIAL_CALCULATION_RUN_ID
} from './mockData';
import { buildMockProfileTimeseries } from './timeseries';

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
      return delay(getMockCurrentContext());
    }
    return requestJson<KornixCurrentContextDto>('/api/v1/kornix/current-context');
  },

  async calculateWaterRegime(irrigationScenario: IrrigationTaskPayloadDto): Promise<KornixCalculateResponse> {
    const request: KornixCalculateRequest = {
      seasonYear: 2026,
      irrigationScenario
    };

    if (mockEnabled) {
      return delay(buildMockCalculateResponse(irrigationScenario), 900);
    }

    return requestJson<KornixCalculateResponse>('/api/v1/kornix/water-regime/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
  },

  async getFieldSeasonMap(params: {
    calculationRunId: CalculationRunId;
    day: string;
  }): Promise<FieldSeasonMapFeatureCollection> {
    if (mockEnabled) {
      return delay(buildMockFieldSeasonMapForDay(params.calculationRunId || MOCK_INITIAL_CALCULATION_RUN_ID, params.day));
    }

    const query = new URLSearchParams({
      calculationRunId: params.calculationRunId,
      day: params.day
    });
    return requestJson<FieldSeasonMapFeatureCollection>(
      `/api/v1/kornix/field-seasons/map?${query.toString()}`
    );
  },

  async getProfileTimeseries(params: {
    calculationRunId: CalculationRunId;
    fieldSeasonIds: string[];
    aggregation?: 'area_weighted_mean';
  }): Promise<KornixProfileTimeseriesDto> {
    if (mockEnabled) {
      const fields = buildMockFieldSeasonMapForDay(params.calculationRunId);
      return delay(
        buildMockProfileTimeseries({
          calculationRunId: params.calculationRunId,
          fieldSeasonIds: params.fieldSeasonIds,
          fields
        })
      );
    }

    const query = new URLSearchParams({
      calculationRunId: params.calculationRunId,
      fieldSeasonIds: params.fieldSeasonIds.join(',')
    });
    if (params.fieldSeasonIds.length > 1) {
      query.set('aggregation', params.aggregation ?? 'area_weighted_mean');
    }
    return requestJson<KornixProfileTimeseriesDto>(
      `/api/v1/kornix/water-regime/profile-timeseries?${query.toString()}`
    );
  },

  metrics: KORNIX_METRICS
};
