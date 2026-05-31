import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type {
  FieldSeasonMapFeature,
  FieldSeasonMapFeatureCollection,
  FieldSeasonMapPropertiesDto,
  FieldWaterRegimeStatusCode
} from '../types/kornix';
import { buildFieldTooltipHtml } from './FieldTooltip';

export type MapDisplayMode = 'status' | 'water_percent' | 'precipitation' | 'irrigation' | 'temperature_sum';

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
    case 'readiness_blocked':
      return { ...base, color: '#5f6368', fillColor: '#b0b4b8', dashArray: '4 4' };
    case 'no_data':
    default:
      return { ...base, color: '#607d8b', fillColor: '#cfd8dc' };
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

function threePointGradient(low: string, middle: string, high: string, ratio: number): string {
  if (ratio <= 0.5) {
    return mixColor(low, middle, ratio * 2);
  }
  return mixColor(middle, high, (ratio - 0.5) * 2);
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
  return fieldName.replace(/^поле\s+/i, '').trim();
}

function getLabelScale(zoom: number): number {
  return clamp((zoom - 7) / 5, 0.38, 1.08);
}

function styleForMetric(
  field: FieldSeasonMapPropertiesDto | undefined,
  mode: MapDisplayMode,
  ranges: Record<Exclude<MapDisplayMode, 'status'>, { min: number; max: number }>
): L.PathOptions {
  const base: L.PathOptions = {
    weight: 1,
    opacity: 0.95,
    fillOpacity: 0.58
  };

  if (!field || mode === 'status') {
    return styleForStatus(field?.latestStatus ?? 'no_data');
  }

  if (mode === 'water_percent') {
    const ratio = clamp((field.currentWaterPercent ?? 0) / 100);
    const fillColor = threePointGradient('#d95745', '#f0c84b', '#2f8f46', ratio);
    return { ...base, color: '#2d5a2f', fillColor };
  }

  if (mode === 'precipitation') {
    const fillColor = mixColor('#eaf8ff', '#0878be', ratioInRange(field.precipitationMm, ranges.precipitation));
    return { ...base, color: '#176f9f', fillColor };
  }

  if (mode === 'irrigation') {
    const fillColor = mixColor('#edf4ff', '#174ea6', ratioInRange(field.actualIrrigationMm, ranges.irrigation));
    return { ...base, color: '#174ea6', fillColor };
  }

  const fillColor = mixColor(
    '#fff3df',
    '#d95f0b',
    ratioInRange(field.temperatureSumFromSowingC, ranges.temperature_sum)
  );
  return { ...base, color: '#b44e08', fillColor };
}

export function FieldMap({
  fields,
  mode,
  selectedFieldSeasonIds,
  onSelectField
}: {
  fields: FieldSeasonMapFeatureCollection;
  mode: MapDisplayMode;
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

    const map = L.map(containerRef.current, {
      zoomControl: true,
      preferCanvas: true
    }).setView([51.9, 36.85], 13);

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

    const ranges = {
      water_percent: valueRange(fields, (field) => field.currentWaterPercent),
      precipitation: valueRange(fields, (field) => field.precipitationMm),
      irrigation: valueRange(fields, (field) => field.actualIrrigationMm),
      temperature_sum: valueRange(fields, (field) => field.temperatureSumFromSowingC)
    };

    const layer = L.geoJSON(fields, {
      style: (feature) => {
        const fieldSeasonId = feature?.properties?.fieldSeasonId;
        const selected = fieldSeasonId && selectedFieldSeasonIds.includes(fieldSeasonId);
        return {
          ...styleForMetric(feature?.properties, mode, ranges),
          weight: selected ? 2 : 1
        };
      },
      onEachFeature: (feature, featureLayer) => {
        featureLayer.bindTooltip(buildFieldTooltipHtml(feature.properties), {
          sticky: true,
          direction: 'top',
          opacity: 0.98,
          className: 'leaflet-kornix-tooltip'
        });

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
          html: `<span>${escapeHtml(getFieldMapLabel(feature.properties.fieldName))}</span>`
        })
      });
      labels.addLayer(label);
    });
    labels.addTo(map);
    labelLayerRef.current = labels;

    const boundsKey = fields.features.map((feature) => feature.properties.fieldSeasonId).join('|');
    const bounds = layer.getBounds();
    if (bounds.isValid() && fittedBoundsKeyRef.current !== boundsKey) {
      map.fitBounds(bounds, { padding: [28, 28] });
      fittedBoundsKeyRef.current = boundsKey;
    }
  }, [fields, mode, selectedFieldSeasonIds, onSelectField]);

  return <div ref={containerRef} className="map-container" />;
}
