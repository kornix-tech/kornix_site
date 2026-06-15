import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type {
  FieldSeasonMapFeature,
  FieldSeasonMapFeatureCollection,
  FieldSeasonMapPropertiesDto,
  FieldWaterRegimeStatusCode,
  KornixCurrentContextDto
} from '../types/kornix';
import { deriveWaterMetrics } from '../features/water-regime/derivedWaterMetrics';
import { buildFieldTooltipHtml, type FieldRegulationRange, type FieldTooltipSummary } from './FieldTooltip';
import { fieldMoistureZoneLabel, type FieldMoistureZoneCode } from './FieldSelectorPanel';
import { formatNumber } from './format';

export type MapDisplayMode =
  | 'status'
  | 'water_percent'
  | 'field_capacity_percent'
  | 'minimum_irrigation'
  | 'temperature_sum';

type MapMetricRanges = Record<Exclude<MapDisplayMode, 'status'>, { min: number; max: number }>;

function styleForStatus(status: FieldWaterRegimeStatusCode): L.PathOptions {
  const base: L.PathOptions = {
    weight: 1,
    opacity: 0.95,
    fillOpacity: 0.42
  };

  switch (status) {
    case 'ok':
      return { ...base, color: '#177245', fillColor: '#4caf50' };
    case 'warning':
      return { ...base, color: '#a66b00', fillColor: '#ffc107' };
    case 'critical':
      return { ...base, color: '#9f1d20', fillColor: '#e53935' };
    case 'not_calculated':
    case 'calculation_failed':
      return { ...base, color: '#5f6368', fillColor: '#b0b4b8', dashArray: '4 4' };
    case 'no_data':
    default:
      return { ...base, color: '#607d8b', fillColor: '#cfd8dc' };
  }
}

function styleForMoistureZone(zone: FieldMoistureZoneCode | undefined): L.PathOptions {
  const base: L.PathOptions = {
    weight: 1,
    opacity: 0.95,
    fillOpacity: 0.62
  };

  switch (zone) {
    case 'regulation':
      return { ...base, color: '#4f8f37', fillColor: '#eaf6e3' };
    case 'upper_warning':
      return { ...base, color: '#5a9fbd', fillColor: '#dff4ff' };
    case 'lower_warning':
      return { ...base, color: '#b8941c', fillColor: '#fff8df' };
    case 'wilting_stress':
      return { ...base, color: '#c84b48', fillColor: '#fff0f0' };
    case 'no_data':
    default:
      return { ...base, color: '#607d8b', fillColor: '#f0f3ef', dashArray: '4 4' };
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function rgbToHex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function mixColor(from: string, to: string, ratio: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const normalized = clamp(ratio);
  return rgbToHex([
    start[0] + (end[0] - start[0]) * normalized,
    start[1] + (end[1] - start[1]) * normalized,
    start[2] + (end[2] - start[2]) * normalized
  ]);
}

function valueRange(
  fields: FieldSeasonMapFeatureCollection,
  getter: (field: FieldSeasonMapPropertiesDto) => number | null | undefined
) {
  const values = fields.features
    .map((feature) => getter(feature.properties))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (!values.length) {
    return { min: 0, max: 1 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max: min === max ? min + 1 : max };
}

function ratioInRange(value: number | null | undefined, range: { min: number; max: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return clamp((value - range.min) / (range.max - range.min));
}

function colorForWaterPercent(value: number): string {
  const percent = Math.max(0, Math.min(100, value));

  if (percent < 20) {
    return '#d84a40';
  }
  if (percent < 40) {
    return '#e9863d';
  }
  if (percent < 60) {
    return '#e7c94d';
  }
  if (percent < 80) {
    return '#5aa85d';
  }
  return '#2f74d0';
}

function fieldCapacityWaterPercent(field: FieldSeasonMapPropertiesDto): number | null {
  const fieldCapacity = field.soil_field_capacity_water_mm;
  const water = field.soil_water_end_mm ?? field.soil_water_content_mm;

  if (
    typeof fieldCapacity !== 'number' ||
    typeof water !== 'number' ||
    !Number.isFinite(fieldCapacity) ||
    !Number.isFinite(water) ||
    fieldCapacity <= 0
  ) {
    return null;
  }

  return (water / fieldCapacity) * 100;
}

function colorForFieldCapacityPercent(value: number): string {
  const percent = Math.max(0, Math.min(100, value));

  if (percent < 50) {
    return '#d84a40';
  }
  if (percent < 70) {
    return '#e9863d';
  }
  if (percent < 90) {
    return '#5aa85d';
  }
  return '#e7c94d';
}

function minimumIrrigationMm(field: FieldSeasonMapPropertiesDto, regulationRange: FieldRegulationRange): number | null {
  const fieldCapacity = field.soil_field_capacity_water_mm;
  const water = field.soil_water_end_mm ?? field.soil_water_content_mm;

  if (
    typeof fieldCapacity !== 'number' ||
    typeof water !== 'number' ||
    !Number.isFinite(fieldCapacity) ||
    !Number.isFinite(water) ||
    fieldCapacity <= 0
  ) {
    return null;
  }

  return Math.max(0, fieldCapacity * regulationRange.min - water);
}

function colorForMinimumIrrigation(value: number): string {
  if (value < 5) {
    return 'transparent';
  }
  if (value < 15) {
    return '#32b8e6';
  }
  if (value < 25) {
    return '#0646c8';
  }
  return '#00a99d';
}

function readableMetricColor(color: string): string {
  return color === 'transparent' ? '#607d8b' : color;
}

function noDataSummary(label: string): FieldTooltipSummary {
  return {
    label,
    value: 'нет данных',
    color: '#607d8b'
  };
}

function buildMetricTooltipSummary(
  field: FieldSeasonMapPropertiesDto,
  mode: MapDisplayMode,
  ranges: MapMetricRanges,
  currentMoistureZones: ReadonlyMap<string, FieldMoistureZoneCode> | undefined,
  regulationRange: FieldRegulationRange
): FieldTooltipSummary {
  if (mode === 'status') {
    const zone = currentMoistureZones?.get(field.fieldSeasonId) ?? 'no_data';
    const zoneStyle = styleForMoistureZone(zone);
    return {
      label: 'Уровень влагозапасов',
      value: fieldMoistureZoneLabel(zone),
      color: typeof zoneStyle.color === 'string' ? zoneStyle.color : '#607d8b'
    };
  }

  if (mode === 'water_percent') {
    const waterPercent = deriveWaterMetrics(field).available_water_fraction_pct;
    if (waterPercent === null) {
      return noDataSummary('Процент продуктивных влагозапасов');
    }
    return {
      label: 'Процент продуктивных влагозапасов',
      value: `${formatNumber(waterPercent, 0)}%`,
      color: colorForWaterPercent(waterPercent)
    };
  }

  if (mode === 'field_capacity_percent') {
    const fieldCapacityPercent = fieldCapacityWaterPercent(field);
    if (fieldCapacityPercent === null) {
      return noDataSummary('Влагозапасы в % НВ');
    }
    return {
      label: 'Влагозапасы в % НВ',
      value: `${formatNumber(fieldCapacityPercent, 0)}%`,
      color: colorForFieldCapacityPercent(fieldCapacityPercent)
    };
  }

  if (mode === 'minimum_irrigation') {
    const minimumIrrigation = minimumIrrigationMm(field, regulationRange);
    if (minimumIrrigation === null) {
      return noDataSummary('Минимальный полив');
    }
    return {
      label: 'Минимальный полив',
      value: minimumIrrigation < 5 ? 'не требуется' : `${formatNumber(minimumIrrigation, 0)} мм`,
      color: readableMetricColor(colorForMinimumIrrigation(minimumIrrigation))
    };
  }

  const temperatureSum = field.positive_temperature_sum_from_sowing_c;
  if (typeof temperatureSum !== 'number' || !Number.isFinite(temperatureSum)) {
    return noDataSummary('Сумма температур от даты сева');
  }
  return {
    label: 'Сумма температур от даты сева',
    value: `${formatNumber(temperatureSum, 0)} °C`,
    color: mixColor('#fff3df', '#d95f0b', ratioInRange(temperatureSum, ranges.temperature_sum))
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (symbol) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[symbol] ?? symbol;
  });
}

function getFieldMapLabel(fieldName: string): string {
  const withoutFieldWord = fieldName.replace(/^поле\s+/i, '').trim();
  const withoutTenantPrefix = withoutFieldWord.replace(/^[A-Za-zА-Яа-яЁё0-9_]+:/, '').trim();
  return withoutTenantPrefix || withoutFieldWord;
}

function getLabelScale(zoom: number): number {
  return clamp((zoom - 7) / 5, 0.38, 1.08);
}

function hasRenderableGeometry(feature: FieldSeasonMapFeature): boolean {
  const geometry = feature.geometry;
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.some((ring) => ring.length >= 4);
  }
  return geometry.coordinates.some((polygon) => polygon.some((ring) => ring.length >= 4));
}

function boundsFromContext(mapBounds: KornixCurrentContextDto['mapBounds'] | undefined): L.LatLngBounds | null {
  if (!mapBounds) {
    return null;
  }

  const { minLng, minLat, maxLng, maxLat } = mapBounds;
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
    return null;
  }

  const bounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
  return bounds.isValid() ? bounds : null;
}

function centerFromBounds(bounds: L.LatLngBounds | null): L.LatLngExpression {
  return bounds?.getCenter() ?? [51.9, 36.85];
}

function styleForMetric(
  field: FieldSeasonMapPropertiesDto | undefined,
  mode: MapDisplayMode,
  ranges: MapMetricRanges,
  currentMoistureZones?: ReadonlyMap<string, FieldMoistureZoneCode>,
  regulationRange?: FieldRegulationRange
): L.PathOptions {
  const base: L.PathOptions = {
    weight: 1,
    opacity: 0.95,
    fillOpacity: 0.58
  };

  if (!field) {
    return styleForStatus('no_data');
  }

  if (mode === 'status') {
    return styleForMoistureZone(currentMoistureZones?.get(field.fieldSeasonId));
  }

  if (mode === 'water_percent') {
    const waterFraction = deriveWaterMetrics(field).available_water_fraction_pct;
    if (waterFraction === null) {
      return styleForStatus('no_data');
    }
    const fillColor = colorForWaterPercent(waterFraction);
    return { ...base, color: fillColor, fillColor };
  }

  if (mode === 'field_capacity_percent') {
    const percentOfFieldCapacity = fieldCapacityWaterPercent(field);
    if (percentOfFieldCapacity === null) {
      return styleForStatus('no_data');
    }
    const fillColor = colorForFieldCapacityPercent(percentOfFieldCapacity);
    return { ...base, color: fillColor, fillColor };
  }

  if (mode === 'minimum_irrigation') {
    const minimumIrrigation = regulationRange ? minimumIrrigationMm(field, regulationRange) : null;
    if (minimumIrrigation === null) {
      return styleForStatus('no_data');
    }
    const fillColor = colorForMinimumIrrigation(minimumIrrigation);
    return { ...base, color: '#0646c8', fillColor };
  }

  const fillColor = mixColor(
    '#fff3df',
    '#d95f0b',
    ratioInRange(field.positive_temperature_sum_from_sowing_c, ranges.temperature_sum)
  );
  return { ...base, color: '#b44e08', fillColor };
}

export function FieldMap({
  fields,
  mapBounds,
  mode,
  regulationRange,
  currentMoistureZones,
  selectedFieldSeasonIds,
  onSelectField
}: {
  fields: FieldSeasonMapFeatureCollection;
  mapBounds?: KornixCurrentContextDto['mapBounds'];
  mode: MapDisplayMode;
  regulationRange: FieldRegulationRange;
  currentMoistureZones?: ReadonlyMap<string, FieldMoistureZoneCode>;
  selectedFieldSeasonIds: string[];
  onSelectField: (fieldSeasonId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);
  const fittedBoundsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const initialBounds = boundsFromContext(mapBounds);
    const map = L.map(containerRef.current, {
      zoomControl: true,
      preferCanvas: true
    }).setView(centerFromBounds(initialBounds), initialBounds ? 11 : 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true,
      maxZoom: 19
    }).addTo(map);

    const syncLabelScale = () => {
      containerRef.current?.style.setProperty('--field-label-scale', getLabelScale(map.getZoom()).toFixed(2));
    };
    syncLabelScale();
    map.on('zoom zoomend', syncLabelScale);

    mapRef.current = map;

    return () => {
      map.off('zoom zoomend', syncLabelScale);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (layerRef.current) {
      layerRef.current.remove();
    }
    if (labelLayerRef.current) {
      labelLayerRef.current.remove();
    }

    const renderableFields: FieldSeasonMapFeatureCollection = {
      ...fields,
      features: fields.features.filter(hasRenderableGeometry)
    };

    const ranges = {
      water_percent: valueRange(renderableFields, (field) => deriveWaterMetrics(field).available_water_fraction_pct),
      field_capacity_percent: valueRange(renderableFields, fieldCapacityWaterPercent),
      minimum_irrigation: valueRange(renderableFields, (field) => minimumIrrigationMm(field, regulationRange)),
      temperature_sum: valueRange(renderableFields, (field) => field.positive_temperature_sum_from_sowing_c)
    };

    const layer = L.geoJSON(renderableFields, {
      style: (feature) => {
        const fieldSeasonId = feature?.properties?.fieldSeasonId;
        const selected = fieldSeasonId && selectedFieldSeasonIds.includes(fieldSeasonId);
        return {
          ...styleForMetric(feature?.properties, mode, ranges, currentMoistureZones, regulationRange),
          weight: selected ? 2 : 1
        };
      },
      onEachFeature: (feature, featureLayer) => {
        featureLayer.bindTooltip(
          buildFieldTooltipHtml(
            feature.properties,
            regulationRange,
            buildMetricTooltipSummary(feature.properties, mode, ranges, currentMoistureZones, regulationRange)
          ),
          {
            sticky: true,
            direction: 'top',
            opacity: 0.98,
            className: 'leaflet-kornix-tooltip'
          }
        );

        featureLayer.on('mouseover', () => {
          const path = featureLayer as L.Path;
          path.setStyle({ weight: 2 });
        });

        featureLayer.on('mouseout', () => {
          layer.resetStyle(featureLayer);
        });

        featureLayer.on('click', () => {
          onSelectField(feature.properties.fieldSeasonId);
        });
      }
    }).addTo(map);

    layerRef.current = layer;

    const labels = L.layerGroup();
    layer.eachLayer((fieldLayer) => {
      const feature = (fieldLayer as L.Layer & { feature?: FieldSeasonMapFeature }).feature;
      const bounds = (fieldLayer as L.Polygon).getBounds?.();
      if (!feature?.properties || !bounds?.isValid()) {
        return;
      }

      const label = L.marker(bounds.getCenter(), {
        interactive: false,
        icon: L.divIcon({
          className: 'field-center-label',
          html: `<span>${escapeHtml(getFieldMapLabel(feature.properties.fieldDisplayName || feature.properties.fieldName))}</span>`
        })
      });
      labels.addLayer(label);
    });
    labels.addTo(map);
    labelLayerRef.current = labels;

    const geometryBounds = layer.getBounds();
    const contextBounds = boundsFromContext(mapBounds);
    const fitBounds = geometryBounds.isValid() ? geometryBounds : contextBounds;
    const boundsKey = [
      fields.organizationCode,
      fields.calculationRunId,
      mapBounds ? `${mapBounds.minLng},${mapBounds.minLat},${mapBounds.maxLng},${mapBounds.maxLat}` : 'no-context-bounds',
      renderableFields.features.map((feature) => feature.properties.fieldSeasonId).join('|')
    ].join('::');
    if (fitBounds?.isValid() && fittedBoundsKeyRef.current !== boundsKey) {
      map.fitBounds(fitBounds, { padding: [28, 28] });
      fittedBoundsKeyRef.current = boundsKey;
    }
  }, [fields, mapBounds, mode, regulationRange, currentMoistureZones, selectedFieldSeasonIds, onSelectField]);

  return <div ref={containerRef} className="map-container" />;
}
