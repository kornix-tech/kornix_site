import { KORNIX_METRICS } from '../config/metrics';
import { isMockRuntimeAllowed } from '../config/runtimeSafety';
import { mockAuthUser } from '../features/auth/mockAuthClient';
import { requestJson } from '../shared/api/httpClient';
import type {
  CalculationRunId,
  FieldSeasonCatalogDto,
  CurrentUserDto,
  FieldSeasonMapFeature,
  FieldSeasonMapPropertiesDto,
  FieldSeasonMapFeatureCollection,
  IrrigationRecommendationDto,
  IrrigationTaskPayloadDto,
  KornixCalculateRequest,
  KornixCalculateResponse,
  KornixCurrentContextDto,
  KornixProfileTimeseriesDto
} from '../types/kornix';
import {
  buildMockCalculateResponse,
  buildMockFieldSeasonMapForDay,
  getMockFieldSeasonCatalog,
  getMockCurrentContext,
  MOCK_INITIAL_CALCULATION_RUN_ID
} from './mockData';
import { buildMockProfileTimeseries } from './timeseries';

const mockEnabled = import.meta.env.VITE_ENABLE_MOCK_API === 'true' && isMockRuntimeAllowed();
const DEFAULT_CALCULATION_REQUEST_TIMEOUT_MS = 120_000;
const configuredCalculationTimeoutMs = Number(import.meta.env.VITE_KORNIX_CALCULATION_TIMEOUT_MS);
const CALCULATION_REQUEST_TIMEOUT_MS =
  Number.isFinite(configuredCalculationTimeoutMs) && configuredCalculationTimeoutMs > 0
    ? configuredCalculationTimeoutMs
    : DEFAULT_CALCULATION_REQUEST_TIMEOUT_MS;

function delay<T>(value: T, ms = 200): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

type CamelCaseRecommendationDto = {
  fieldSeasonId: string;
  recommendedIrrigationDate?: string | null;
  recommendedIrrigationMm?: number | null;
  recommendedIrrigationReasonCode?: string | null;
  recommendedIrrigationPriority?: 'ok' | 'warning' | 'critical' | null;
  recommendedIrrigationConfidence?: number | null;
};

type MapPropertiesWithCamelCaseRecommendation = FieldSeasonMapPropertiesDto & {
  recommendedIrrigationDate?: string | null;
  recommendedIrrigationMm?: number | null;
};

function normalizeRecommendation(
  recommendation: IrrigationRecommendationDto | CamelCaseRecommendationDto
): IrrigationRecommendationDto {
  const legacy = recommendation as CamelCaseRecommendationDto;
  const current = recommendation as IrrigationRecommendationDto;
  return {
    fieldSeasonId: current.fieldSeasonId,
    recommended_irrigation_date: current.recommended_irrigation_date ?? legacy.recommendedIrrigationDate ?? null,
    recommended_irrigation_mm: current.recommended_irrigation_mm ?? legacy.recommendedIrrigationMm ?? null,
    recommended_irrigation_reason_code:
      current.recommended_irrigation_reason_code ?? legacy.recommendedIrrigationReasonCode ?? null,
    recommended_irrigation_priority:
      current.recommended_irrigation_priority ?? legacy.recommendedIrrigationPriority ?? null,
    recommended_irrigation_confidence:
      current.recommended_irrigation_confidence ?? legacy.recommendedIrrigationConfidence ?? null
  };
}

function normalizeMapProperties(properties: MapPropertiesWithCamelCaseRecommendation): FieldSeasonMapPropertiesDto {
  return {
    ...properties,
    fieldName: properties.fieldName || properties.fieldKey,
    recommended_irrigation_date:
      properties.recommended_irrigation_date ?? properties.recommendedIrrigationDate ?? null,
    recommended_irrigation_mm: properties.recommended_irrigation_mm ?? properties.recommendedIrrigationMm ?? null,
    dataQuality: properties.dataQuality ?? {
      forcingComplete: false,
      calculationAvailable: false,
      hasActiveMapping: false,
      messages: ['Backend не вернул блок качества данных по полю.']
    }
  };
}

function normalizeMapFeatureCollection(collection: FieldSeasonMapFeatureCollection): FieldSeasonMapFeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry ?? { type: 'MultiPolygon' as const, coordinates: [] },
      properties: normalizeMapProperties(feature.properties as MapPropertiesWithCamelCaseRecommendation)
    })) as FieldSeasonMapFeature[]
  };
}

function normalizeProfileTimeseries(profile: KornixProfileTimeseriesDto): KornixProfileTimeseriesDto {
  return {
    ...profile,
    recommendations: profile.recommendations.map(normalizeRecommendation)
  };
}

function catalogToMapFeatureCollection(catalog: FieldSeasonCatalogDto): FieldSeasonMapFeatureCollection {
  return {
    type: 'FeatureCollection',
    generatedAt: catalog.generatedAt,
    organizationCode: catalog.organizationCode,
    seasonYear: catalog.seasonYear,
    calculationRunId: 'catalog',
    day: '',
    features: catalog.fields.map((field) => {
      const geometry = field.geometry ?? { type: 'MultiPolygon' as const, coordinates: [] };
      return {
        type: 'Feature' as const,
        geometry,
        properties: {
          fieldId: field.fieldId,
          fieldSeasonId: field.fieldSeasonId,
          fieldKey: field.fieldKey,
          fieldName: field.fieldName || field.fieldKey,
          areaHa: field.areaHa,
          cropName: field.cropName,
          cropSowingDate: field.cropSowingDate,
          latestStatus: field.latestStatus ?? 'not_calculated',
          day: '',
          soil_total_capacity_water_mm: null,
          soil_field_capacity_water_mm: null,
          soil_wilting_point_capacity_water_mm: null,
          soil_water_content_mm: null,
          koef_upper_limit: field.koef_upper_limit,
          koef_optimum: field.koef_optimum,
          koef_lower_limit: field.koef_lower_limit,
          precipitation_effective_daily_mm: null,
          irrigation_effective_daily_mm: null,
          positive_temperature_sum_from_sowing_c: null,
          crop_transpiration_daily_mm: null,
          recommended_irrigation_date: null,
          recommended_irrigation_mm: null,
          dataQuality: {
            forcingComplete: false,
            calculationAvailable: false,
            hasActiveMapping: true,
            messages: ['Поле загружено из каталога до первого расчёта.']
          }
        }
      };
    })
  };
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
      timeoutMs: CALCULATION_REQUEST_TIMEOUT_MS,
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
    const collection = await requestJson<FieldSeasonMapFeatureCollection>(
      `/api/v1/kornix/field-seasons/map?${query.toString()}`
    );
    return normalizeMapFeatureCollection(collection);
  },

  async getFieldSeasonCatalog(params: { seasonYear: number }): Promise<FieldSeasonMapFeatureCollection> {
    if (mockEnabled) {
      return delay(catalogToMapFeatureCollection(getMockFieldSeasonCatalog()));
    }

    const query = new URLSearchParams({
      seasonYear: String(params.seasonYear)
    });
    const catalog = await requestJson<FieldSeasonCatalogDto>(
      `/api/v1/kornix/field-seasons/catalog?${query.toString()}`
    );
    return catalogToMapFeatureCollection(catalog);
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
    const profile = await requestJson<KornixProfileTimeseriesDto>(
      `/api/v1/kornix/water-regime/profile-timeseries?${query.toString()}`
    );
    return normalizeProfileTimeseries(profile);
  },

  metrics: KORNIX_METRICS
};
