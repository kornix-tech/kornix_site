import { KORNIX_METRICS } from '../config/metrics';
import { requestJson } from '../shared/api/httpClient';
import type {
  CalculationRunId,
  FieldSeasonCatalogDto,
  CurrentUserDto,
  FieldSeasonMapFeature,
  FieldSeasonMapPropertiesDto,
  FieldSeasonMapFeatureCollection,
  IrrigationRecommendationDto,
  KornixApprovalRequestDto,
  KornixApprovalStatusDto,
  KornixApprovalSubmitResponseDto,
  KornixCalculationRunStatusDto,
  KornixCurrentIrrigationLayerDto,
  KornixCurrentContextDto,
  KornixMethodDto,
  KornixMethodsResponseDto,
  KornixReadinessSummaryDto,
  KornixProfileTimeseriesDto
} from '../types/kornix';

const DEFAULT_CALCULATION_REQUEST_TIMEOUT_MS = 120_000;
const configuredCalculationTimeoutMs = Number(import.meta.env.VITE_KORNIX_CALCULATION_TIMEOUT_MS);
const KORNIX_API_PREFIX = '/api/v2/kornix';
const CALCULATION_REQUEST_TIMEOUT_MS =
  Number.isFinite(configuredCalculationTimeoutMs) && configuredCalculationTimeoutMs > 0
    ? configuredCalculationTimeoutMs
    : DEFAULT_CALCULATION_REQUEST_TIMEOUT_MS;

function seasonYearQuery(seasonYear: number): string {
  return new URLSearchParams({ seasonYear: String(seasonYear) }).toString();
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

type LegacyMethodDto = Partial<KornixMethodDto> & {
  displayName?: string;
  methodVersion?: string;
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
    warnings: collection.warnings ?? [],
    features: (collection.features ?? []).map((feature) => ({
      ...feature,
      geometry: feature.geometry ?? { type: 'MultiPolygon' as const, coordinates: [] },
      properties: normalizeMapProperties(feature.properties as MapPropertiesWithCamelCaseRecommendation)
    })) as FieldSeasonMapFeature[]
  };
}

function normalizeProfileTimeseries(profile: KornixProfileTimeseriesDto): KornixProfileTimeseriesDto {
  return {
    ...profile,
    metrics: profile.metrics ?? [],
    warnings: profile.warnings ?? [],
    recommendations: (profile.recommendations ?? []).map(normalizeRecommendation)
  };
}

function normalizeMethod(method: LegacyMethodDto): KornixMethodDto {
  return {
    methodCode: method.methodCode ?? '',
    label: method.label ?? method.displayName ?? method.methodCode ?? 'Метод без названия',
    version: method.version ?? method.methodVersion ?? 'unknown',
    isDefault: Boolean(method.isDefault),
    isRequired: Boolean(method.isRequired),
    isCandidate: method.isCandidate,
    methodFamily: method.methodFamily ?? null
  };
}

function normalizeMethodsResponse(response: KornixMethodsResponseDto | KornixMethodDto[]): KornixMethodsResponseDto {
  if (Array.isArray(response)) {
    const methods = response.map(normalizeMethod).filter((method) => method.methodCode);
    const defaultMethod = methods.find((method) => method.isDefault) ?? methods[0];
    return {
      defaultMethodCode: defaultMethod?.methodCode ?? '',
      operationalMethodSetCode: 'unknown',
      methods
    };
  }

  return {
    ...response,
    methods: (response.methods ?? []).map(normalizeMethod).filter((method) => method.methodCode)
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
    features: (catalog.fields ?? []).map((field) => {
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
    return requestJson<CurrentUserDto>('/api/v2/me');
  },

  async getCurrentContextV2(params: { seasonYear: number }): Promise<KornixCurrentContextDto> {
    return requestJson<KornixCurrentContextDto>(
      `${KORNIX_API_PREFIX}/current-context?${seasonYearQuery(params.seasonYear)}`
    );
  },

  async getCurrentContext(params: { seasonYear: number }): Promise<KornixCurrentContextDto> {
    return this.getCurrentContextV2(params);
  },

  async submitWaterRegimeApprovalV2(request: KornixApprovalRequestDto): Promise<KornixApprovalSubmitResponseDto> {
    return requestJson<KornixApprovalSubmitResponseDto>(`${KORNIX_API_PREFIX}/water-regime/approvals`, {
      method: 'POST',
      timeoutMs: CALCULATION_REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
  },

  async getApprovalStatusV2(approvalBatchId: string): Promise<KornixApprovalStatusDto> {
    return requestJson<KornixApprovalStatusDto>(
      `${KORNIX_API_PREFIX}/water-regime/approvals/${encodeURIComponent(approvalBatchId)}`
    );
  },

  async getCurrentIrrigationLayerV2(params: { seasonYear: number }): Promise<KornixCurrentIrrigationLayerDto> {
    return requestJson<KornixCurrentIrrigationLayerDto>(
      `${KORNIX_API_PREFIX}/irrigation-layer/current?${seasonYearQuery(params.seasonYear)}`
    );
  },

  async getCalculationRunStatusV2(calculationRunId: string): Promise<KornixCalculationRunStatusDto> {
    return requestJson<KornixCalculationRunStatusDto>(
      `${KORNIX_API_PREFIX}/water-regime/calculation-runs/${encodeURIComponent(calculationRunId)}`
    );
  },

  async getReadinessCurrentV2(params: { seasonYear: number }): Promise<KornixReadinessSummaryDto> {
    return requestJson<KornixReadinessSummaryDto>(
      `${KORNIX_API_PREFIX}/readiness/current?${seasonYearQuery(params.seasonYear)}`
    );
  },

  async getMethodsV2(): Promise<KornixMethodsResponseDto> {
    const response = await requestJson<KornixMethodsResponseDto | KornixMethodDto[]>(`${KORNIX_API_PREFIX}/methods`);
    return normalizeMethodsResponse(response);
  },

  async getFieldSeasonMapV2(params: {
    calculationRunId: CalculationRunId;
    methodCode: string;
    day: string;
  }): Promise<FieldSeasonMapFeatureCollection> {
    const query = new URLSearchParams({
      calculationRunId: params.calculationRunId,
      methodCode: params.methodCode,
      day: params.day
    });
    const collection = await requestJson<FieldSeasonMapFeatureCollection>(
      `${KORNIX_API_PREFIX}/field-seasons/map?${query.toString()}`
    );
    return normalizeMapFeatureCollection(collection);
  },

  async getFieldSeasonMap(params: {
    calculationRunId: CalculationRunId;
    methodCode: string;
    day: string;
  }): Promise<FieldSeasonMapFeatureCollection> {
    return this.getFieldSeasonMapV2(params);
  },

  async getFieldSeasonCatalogV2(params: { seasonYear: number }): Promise<FieldSeasonMapFeatureCollection> {
    const query = new URLSearchParams({
      seasonYear: String(params.seasonYear)
    });
    const catalog = await requestJson<FieldSeasonCatalogDto>(
      `${KORNIX_API_PREFIX}/field-seasons/catalog?${query.toString()}`
    );
    return catalogToMapFeatureCollection(catalog);
  },

  async getFieldSeasonCatalog(params: { seasonYear: number }): Promise<FieldSeasonMapFeatureCollection> {
    return this.getFieldSeasonCatalogV2(params);
  },

  async getProfileTimeseriesV2(params: {
    calculationRunId: CalculationRunId;
    methodCode: string;
    fieldSeasonIds: string[];
    aggregation?: 'area_weighted_mean';
  }): Promise<KornixProfileTimeseriesDto> {
    const query = new URLSearchParams({
      calculationRunId: params.calculationRunId,
      methodCode: params.methodCode,
      fieldSeasonIds: params.fieldSeasonIds.join(',')
    });
    if (params.fieldSeasonIds.length > 1) {
      query.set('aggregation', params.aggregation ?? 'area_weighted_mean');
    }
    const profile = await requestJson<KornixProfileTimeseriesDto>(
      `${KORNIX_API_PREFIX}/water-regime/profile-timeseries?${query.toString()}`
    );
    return normalizeProfileTimeseries(profile);
  },

  async getProfileTimeseries(params: {
    calculationRunId: CalculationRunId;
    methodCode: string;
    fieldSeasonIds: string[];
    aggregation?: 'area_weighted_mean';
  }): Promise<KornixProfileTimeseriesDto> {
    return this.getProfileTimeseriesV2(params);
  },

  metrics: KORNIX_METRICS
};
