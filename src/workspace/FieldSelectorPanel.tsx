import { useEffect, useMemo, useState, type Ref } from 'react';
import type { FieldSeasonMapFeatureCollection } from '../types/kornix';
import { formatArea } from './format';

type FieldSearchableProperties = FieldSeasonMapFeatureCollection['features'][number]['properties'] & {
  cropVariety?: string | null;
  crop_variety?: string | null;
  cultivar?: string | null;
  cultivarName?: string | null;
  cultivar_name?: string | null;
  variety?: string | null;
  varietyName?: string | null;
  variety_name?: string | null;
};

export type FieldMoistureZoneCode = 'upper_warning' | 'regulation' | 'lower_warning' | 'wilting_stress' | 'no_data';

const fieldMoistureZoneLabels: Record<FieldMoistureZoneCode, string> = {
  upper_warning: 'Влажно',
  regulation: 'Влагозапасы в норме',
  lower_warning: 'Сухо',
  wilting_stress: 'Нужен полив',
  no_data: 'Состояние поля: нет данных'
};

export function fieldMoistureZoneLabel(zone: FieldMoistureZoneCode): string {
  return fieldMoistureZoneLabels[zone];
}

function getFieldSortParts(fieldKey: string): number[] {
  const primaryKey = fieldKey.split(';')[0].trim();
  const matches = primaryKey.match(/\d+/g);
  return matches ? matches.map((part) => Number(part)) : [Number.MAX_SAFE_INTEGER];
}

export function compareFieldKeys(leftKey: string, rightKey: string): number {
  const leftParts = getFieldSortParts(leftKey);
  const rightParts = getFieldSortParts(rightKey);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? -1;
    const rightPart = rightParts[index] ?? -1;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return leftKey.localeCompare(rightKey, 'ru', { numeric: true });
}

export function formatFieldKey(fieldKey: string): string {
  return fieldKey.replace(/^[A-Za-zА-Яа-я]{2,}\s*[:.-]\s*/u, '').trim() || fieldKey;
}

function formatCropName(cropName: string | null | undefined): string {
  if (!cropName) {
    return 'нет культуры';
  }

  return cropName
    .replace(/\s*\b\d{2}г\./g, '')
    .replace(/\s*;\s*/g, '; ')
    .replace(/;\s*$/g, '')
    .trim() || 'нет культуры';
}

function cropVarietyName(field: FieldSearchableProperties): string | null {
  return (
    field.varietyName ??
    field.variety_name ??
    field.cropVariety ??
    field.crop_variety ??
    field.cultivarName ??
    field.cultivar_name ??
    field.variety ??
    field.cultivar ??
    null
  );
}

export function fieldCropLabel(field: FieldSearchableProperties): string {
  const cropName = formatCropName(field.cropName);
  const varietyName = cropVarietyName(field)?.trim();
  if (!varietyName || cropName.toLowerCase().includes(varietyName.toLowerCase())) {
    return cropName;
  }

  return `${cropName} ${varietyName}`;
}

export function FieldListPanel({
  fields,
  currentMoistureZones,
  forecastMoistureZones,
  selectedFieldSeasonIds,
  onChange,
  className,
  listRef,
  onFilteredFieldsChange
}: {
  fields: FieldSeasonMapFeatureCollection;
  currentMoistureZones?: ReadonlyMap<string, FieldMoistureZoneCode>;
  forecastMoistureZones?: ReadonlyMap<string, FieldMoistureZoneCode>;
  selectedFieldSeasonIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  listRef?: Ref<HTMLDivElement>;
  onFilteredFieldsChange?: (fields: FieldSeasonMapFeatureCollection['features']) => void;
}) {
  const [query, setQuery] = useState('');

  const sortedFields = useMemo(
    () =>
      [...fields.features].sort((a, b) =>
        compareFieldKeys(a.properties.fieldKey, b.properties.fieldKey)
      ),
    [fields]
  );

  const allFieldSeasonIds = useMemo(
    () => sortedFields.map((feature) => feature.properties.fieldSeasonId),
    [sortedFields]
  );

  const filtered = useMemo(() => sortedFields.filter((feature) => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    const field = feature.properties;
    return [
      field.fieldName,
      field.fieldKey,
      formatFieldKey(field.fieldKey),
      fieldCropLabel(field)
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  }), [query, sortedFields]);

  useEffect(() => {
    onFilteredFieldsChange?.(filtered);
  }, [filtered, onFilteredFieldsChange]);

  function toggle(id: string) {
    if (selectedFieldSeasonIds.includes(id)) {
      onChange(selectedFieldSeasonIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedFieldSeasonIds, id]);
    }
  }

  return (
    <aside className={className ? `field-selector ${className}` : 'field-selector'}>
      <div className="panel-header">
        <h2>Поля</h2>
        <span>{selectedFieldSeasonIds.length} выбрано</span>
      </div>

      <input
        className="text-input"
        type="search"
        value={query}
        placeholder="Поиск поля"
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="selector-actions">
        <button type="button" onClick={() => onChange(allFieldSeasonIds)}>
          Выбрать все
        </button>
        <button type="button" onClick={() => onChange([])}>
          Снять
        </button>
      </div>

      <div className="field-list" ref={listRef}>
        {filtered.map((feature) => {
          const field = feature.properties;
          const displayFieldKey = formatFieldKey(field.fieldKey);
          const forecastMoistureZone = forecastMoistureZones?.get(field.fieldSeasonId) ?? 'no_data';
          const fieldMoistureZone = currentMoistureZones?.get(field.fieldSeasonId) ?? 'no_data';
          const fieldMoistureZoneLabelText = fieldMoistureZoneLabel(fieldMoistureZone);
          const forecastMoistureZoneLabel = fieldMoistureZoneLabel(forecastMoistureZone);
          return (
            <label
              key={field.fieldSeasonId}
              className={`field-list-item field-status-card field-list-zone-${fieldMoistureZone}`}
              data-status-label={fieldMoistureZoneLabelText}
              title={`Текущий день: ${fieldMoistureZoneLabelText}. Последний день прогноза: ${forecastMoistureZoneLabel}`}
            >
              <input
                type="checkbox"
                checked={selectedFieldSeasonIds.includes(field.fieldSeasonId)}
                onChange={() => toggle(field.fieldSeasonId)}
              />
              <span className="field-list-main">
                <span className="field-list-title">{displayFieldKey}</span>
                <span className="field-list-meta">
                  {formatArea(field.areaHa)} · {fieldCropLabel(field)}
                </span>
              </span>
              <span
                className={`field-forecast-dot field-forecast-dot-zone-${forecastMoistureZone}`}
                title={`Последний день прогноза: ${forecastMoistureZoneLabel}`}
                aria-label={`Последний день прогноза: ${forecastMoistureZoneLabel}`}
              />
            </label>
          );
        })}
      </div>
    </aside>
  );
}

export function FieldSelectorPanel(props: Omit<Parameters<typeof FieldListPanel>[0], 'className' | 'listRef' | 'onFilteredFieldsChange'>) {
  return <FieldListPanel {...props} />;
}
