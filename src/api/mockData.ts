import type {
  FieldSeasonMapFeatureCollection,
  FieldWaterRegimeStatusCode,
  KornixCurrentContextDto
} from '../types/kornix';
import { spasskoeIrrigatedFieldFeatures, spasskoeMapBounds } from './spasskoeIrrigatedFields';

function dayIndex(day?: string): number {
  const value = day ? Date.parse(`${day}T00:00:00Z`) : Date.now();
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.floor(value / 86_400_000);
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

function statusFromWaterPercent(value: number | null): FieldWaterRegimeStatusCode {
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

export const mockCurrentContext: KornixCurrentContextDto = {
  organizationId: 'org_demo',
  organizationName: 'Спасское',
  seasonYear: 2026,
  fieldCount: spasskoeIrrigatedFieldFeatures.length,
  calculationReadyFieldCount: spasskoeIrrigatedFieldFeatures.length,
  mapBounds: spasskoeMapBounds,
  readiness: {
    status: 'ready',
    code: 'KML_IRRIGATED_2026',
    expectedFields: spasskoeIrrigatedFieldFeatures.length,
    actualReadyFields: spasskoeIrrigatedFieldFeatures.length,
    blockers: [
      {
        severity: 'P2',
        code: 'KML_SOURCE',
        message: 'Mock-карта использует поля из СП_.kml с признаком полива в 2026 году.'
      }
    ]
  }
};

export const mockFieldSeasonMap: FieldSeasonMapFeatureCollection = {
  type: 'FeatureCollection',
  features: spasskoeIrrigatedFieldFeatures
};

export function buildMockFieldSeasonMapForDay(day?: string): FieldSeasonMapFeatureCollection {
  const index = dayIndex(day);

  return {
    type: 'FeatureCollection',
    features: spasskoeIrrigatedFieldFeatures.map((feature) => {
      const field = feature.properties;
      const seed = hashString(field.fieldSeasonId);
      const baseWaterPercent = field.currentWaterPercent ?? 55;
      const currentWaterPercent = Math.max(8, Math.min(96, baseWaterPercent + wave(index, seed, 12)));
      const currentWaterMm = Math.max(0, (field.currentWaterMm ?? 65) + wave(index, seed + 17, 10));
      const precipitationMm = (index + seed) % 6 === 0 ? Math.max(0, 2 + wave(index, seed + 29, 4)) : 0;
      const actualIrrigationMm = (index + seed) % 11 === 0 ? 12 : 0;
      const temperatureSumFromSowingC =
        typeof field.temperatureSumFromSowingC === 'number'
          ? field.temperatureSumFromSowingC + Math.max(0, index - dayIndex('2026-05-31')) * 12
          : null;

      return {
        ...feature,
        properties: {
          ...field,
          latestWaterRegimeDay: day ?? field.latestWaterRegimeDay,
          currentWaterPercent: round1(currentWaterPercent),
          currentWaterMm: round1(currentWaterMm),
          availableWaterMm: round1(Math.max(currentWaterMm + 18, field.availableWaterMm ?? currentWaterMm + 18)),
          precipitationMm: round1(precipitationMm),
          actualIrrigationMm: round1(actualIrrigationMm),
          latestStatus: statusFromWaterPercent(currentWaterPercent),
          temperatureSumFromSowingC:
            temperatureSumFromSowingC === null ? null : round1(temperatureSumFromSowingC)
        }
      };
    })
  };
}
