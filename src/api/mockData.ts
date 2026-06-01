import type {
  CalculationRunId,
  FieldSeasonCatalogDto,
  FieldSeasonMapFeatureCollection,
  FieldWaterRegimeStatusCode,
  KornixApprovalRequestDto,
  KornixApprovalStatusDto,
  KornixApprovalSubmitResponseDto,
  KornixCurrentIrrigationLayerDto,
  KornixCurrentContextDto
} from '../types/kornix';
import { deriveWaterMetrics } from '../features/water-regime/derivedWaterMetrics';
import { spasskoeIrrigatedFieldFeatures, spasskoeMapBounds } from './spasskoeIrrigatedFields';

export const MOCK_SEASON_YEAR = 2026;
export const MOCK_INITIAL_CALCULATION_RUN_ID = 'mock-sp-2026-initial';
const MOSCOW_TIMEZONE = 'Europe/Moscow';

let lastScenarioHash = '';
let lastCalculationRunId: CalculationRunId = MOCK_INITIAL_CALCULATION_RUN_ID;

function dayIndex(day?: string): number {
  const value = day ? Date.parse(`${day}T00:00:00Z`) : Date.now();
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.floor(value / 86_400_000);
}

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function addDaysIso(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function wave(index: number, seed: number, amplitude: number): number {
  return Math.sin((index + seed) / 4.2) * amplitude + Math.cos((index + seed) / 7.5) * amplitude * 0.35;
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function isoDateFromLegacy(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parts = value.split('.');
  if (parts.length !== 3) {
    return value;
  }
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function statusFromAvailableWaterFraction(value: number | null): FieldWaterRegimeStatusCode {
  if (value === null) {
    return 'no_data';
  }
  if (value < 35) {
    return 'critical';
  }
  if (value < 55) {
    return 'warning';
  }
  return 'ok';
}

function mockThresholdCoefficients(fc: number, wpc: number) {
  const totalAvailableWater = fc - wpc;
  const thresholdDepletionFraction = 0.45;
  const targetDepletionFraction = 0.25;
  const lowerAbsMm = wpc + (1 - thresholdDepletionFraction) * totalAvailableWater;
  const optimumAbsMm = wpc + (1 - targetDepletionFraction) * totalAvailableWater;

  return {
    koef_upper_limit: 1,
    koef_optimum: round3(optimumAbsMm / fc),
    koef_lower_limit: round3(lowerAbsMm / fc)
  };
}

export function getMockCurrentContext(): KornixCurrentContextDto {
  const serverDate = todayIso();
  const forecastStartDate = serverDate;
  const forecastEndDate = addDaysIso(serverDate, 7);
  return {
    organizationCode: 'SP',
    organizationName: 'Спасское',
    seasonYear: 2026,
    calculationWindow: {
      from: '2026-04-01',
      to: forecastEndDate,
      timezone: MOSCOW_TIMEZONE
    },
    serverDate,
    forecastStartDate,
    forecastEndDate,
    managedScope: {
      dateFrom: addDaysIso(serverDate, -21),
      dateTo: forecastEndDate,
      fieldSeasonIds: spasskoeIrrigatedFieldFeatures.map((feature) => feature.properties.fieldSeasonId),
      scopeVersion: `mock-${serverDate}`
    },
    currentOperationalBaseCalculationRunId: lastCalculationRunId,
    currentAppliedCalculationRunId: lastCalculationRunId,
    lastSuccessfulCalculationRunId: lastCalculationRunId,
    currentOperationalStatus: 'completed',
    currentAppliedStatus: 'completed',
    dataFreshnessStatus: 'current',
    frontendMode: 'current_editable',
    submitAllowed: true,
    submitBlockedReason: null,
    readinessSummary: {
      status: 'pass',
      checkedAt: new Date().toISOString(),
      warnings: []
    },
    readinessDetailsUrl: '/api/v2/kornix/readiness/current',
    availableMethods: [
      {
        methodCode: 'simple_eto_single_layer_soil',
        label: 'Simple ETo, однослойная почва',
        version: 'mock',
        isDefault: true,
        isRequired: true
      }
    ],
    defaultMethodCode: 'simple_eto_single_layer_soil',
    fieldCount: spasskoeIrrigatedFieldFeatures.length,
    generatedAt: new Date().toISOString(),
    mapBounds: spasskoeMapBounds,
    warnings: []
  };
}

export function getMockFieldSeasonCatalog(): FieldSeasonCatalogDto {
  return {
    organizationCode: 'SP',
    seasonYear: 2026,
    generatedAt: new Date().toISOString(),
    fields: buildMockFieldSeasonMapForDay(MOCK_INITIAL_CALCULATION_RUN_ID, todayIso()).features.map((feature) => {
      const field = feature.properties;
      return {
        fieldId: field.fieldId,
        fieldSeasonId: field.fieldSeasonId,
        fieldKey: field.fieldKey,
        fieldName: field.fieldName,
        areaHa: field.areaHa,
        cropName: field.cropName,
        cropSowingDate: field.cropSowingDate,
        koef_upper_limit: field.koef_upper_limit,
        koef_optimum: field.koef_optimum,
        koef_lower_limit: field.koef_lower_limit,
        latestStatus: 'not_calculated',
        geometry: feature.geometry
      };
    })
  };
}

export function buildMockFieldSeasonMapForDay(
  calculationRunId = lastCalculationRunId,
  day = todayIso()
): FieldSeasonMapFeatureCollection {
  const index = dayIndex(day);

  return {
    type: 'FeatureCollection',
    generatedAt: new Date().toISOString(),
    organizationCode: 'SP',
    seasonYear: 2026,
    calculationRunId,
    day,
    features: spasskoeIrrigatedFieldFeatures.map((feature, featureIndex) => {
      const field = feature.properties;
      const seed = hashString(`${calculationRunId}:${field.fieldSeasonId}`);
      const fc = Math.max(70, field.availableWaterMm ?? 110);
      const wpc = Math.max(20, fc * 0.28);
      const tc = fc * 1.18;
      const swcBase = wpc + ((field.currentWaterPercent ?? 55) / 100) * (fc - wpc);
      const swc = Math.max(wpc * 0.75, Math.min(tc, swcBase + wave(index, seed, 10)));
      const thresholdCoefficients = mockThresholdCoefficients(fc, wpc);
      const derived = deriveWaterMetrics({
        soil_field_capacity_water_mm: fc,
        soil_wilting_point_capacity_water_mm: wpc,
        soil_water_content_mm: swc
      });
      const precipitation = (index + seed) % 6 === 0 ? Math.max(0, 2 + wave(index, seed + 29, 4)) : 0;
      const irrigation = (index + seed) % 11 === 0 ? 10 + (seed % 8) : 0;
      const recommendationNeeded = (derived.available_water_fraction_pct ?? 100) < 48 || featureIndex % 9 === 0;

      return {
        type: feature.type,
        geometry: feature.geometry,
        properties: {
          fieldId: field.fieldId,
          fieldSeasonId: field.fieldSeasonId,
          fieldKey: field.fieldKey,
          fieldName: field.fieldName,
          areaHa: field.areaHa,
          cropName: field.cropName,
          cropSowingDate: isoDateFromLegacy(field.sowingDate),
          latestStatus: statusFromAvailableWaterFraction(derived.available_water_fraction_pct),
          day,
          soil_total_capacity_water_mm: round1(tc),
          soil_field_capacity_water_mm: round1(fc),
          soil_wilting_point_capacity_water_mm: round1(wpc),
          soil_water_content_mm: featureIndex % 17 === 0 ? null : round1(swc),
          ...thresholdCoefficients,
          precipitation_effective_daily_mm: round1(precipitation),
          irrigation_effective_daily_mm: round1(irrigation),
          positive_temperature_sum_from_sowing_c:
            typeof field.temperatureSumFromSowingC === 'number'
              ? round1(field.temperatureSumFromSowingC + Math.max(0, index - dayIndex('2026-05-31')) * 12)
              : null,
          crop_transpiration_daily_mm: round1(Math.max(0, 3.2 + wave(index, seed + 41, 1.2))),
          recommended_irrigation_date: recommendationNeeded ? addDaysIso(todayIso(), 3) : null,
          recommended_irrigation_mm: recommendationNeeded ? 22 : null,
          dataQuality: {
            forcingComplete: featureIndex % 13 !== 0,
            calculationAvailable: featureIndex % 19 !== 0,
            hasActiveMapping: field.dataQuality.hasActiveMapping,
            messages: field.dataQuality.messages
          }
        }
      };
    })
  };
}

export function canonicalScenarioHash(payload: KornixApprovalRequestDto): string {
  const canonical = JSON.stringify(
    [...payload.irrigationLayer]
      .sort((left, right) =>
        left.fieldSeasonId.localeCompare(right.fieldSeasonId) ||
        left.irrigationDate.localeCompare(right.irrigationDate) ||
        left.irrigationMm - right.irrigationMm
      )
  );
  return `mock-${hashString(canonical).toString(16)}`;
}

export function buildMockApprovalResponse(payload: KornixApprovalRequestDto): KornixApprovalSubmitResponseDto {
  const hash = canonicalScenarioHash(payload);
  const reusedPreviousCalculation = hash === lastScenarioHash;
  if (!reusedPreviousCalculation) {
    lastScenarioHash = hash;
    lastCalculationRunId = `mock-sp-2026-${hash.slice(5)}-${Date.now().toString(36)}`;
  }

  return {
    approvalBatchId: `mock-approval-${hash.slice(5)}`,
    calculationRunId: lastCalculationRunId,
    approvalStatus: reusedPreviousCalculation ? 'no_changes' : 'applied',
    calculationStatus: reusedPreviousCalculation ? 'reused_existing' : 'completed',
    reusedPreviousCalculation,
    pollRequired: false,
    warnings:
      payload.irrigationLayer.length === 0
        ? [{ code: 'EMPTY_IRRIGATION_LAYER', message: 'Сценарий утверждён без пользовательских поливов.' }]
        : []
  };
}

export function buildMockApprovalStatus(approvalBatchId: string): KornixApprovalStatusDto {
  return {
    approvalBatchId,
    approvalStatus: 'applied',
    ledgerEventsStatus: 'active',
    calculationRunId: lastCalculationRunId,
    calculationStatus: 'completed',
    resultAvailable: true,
    pollRequired: false,
    warnings: []
  };
}

export function getMockCurrentIrrigationLayer(): KornixCurrentIrrigationLayerDto {
  const context = getMockCurrentContext();
  return {
    organizationCode: context.organizationCode,
    seasonYear: context.seasonYear,
    managedScope: context.managedScope,
    irrigationLayer: [],
    projectionHash: `mock-empty-${context.managedScope.scopeVersion}`,
    generatedAt: new Date().toISOString()
  };
}
