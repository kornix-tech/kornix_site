import { useMemo, useState } from 'react';
import type { FieldSeasonMapFeatureCollection } from '../types/kornix';
import { fieldStatusClassName, fieldStatusLabel } from './fieldStatusPresentation';
import { formatArea } from './format';

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

export function FieldSelectorPanel({
  fields,
  selectedFieldSeasonIds,
  onChange
}: {
  fields: FieldSeasonMapFeatureCollection;
  selectedFieldSeasonIds: string[];
  onChange: (ids: string[]) => void;
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

  const filtered = sortedFields.filter((feature) => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return `${feature.properties.fieldName} ${feature.properties.fieldKey}`.toLowerCase().includes(needle);
  });

  function toggle(id: string) {
    if (selectedFieldSeasonIds.includes(id)) {
      onChange(selectedFieldSeasonIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedFieldSeasonIds, id]);
    }
  }

  return (
    <aside className="field-selector">
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

      <div className="field-list">
        {filtered.map((feature) => {
          const field = feature.properties;
          return (
            <label
              key={field.fieldSeasonId}
              className={`field-list-item field-status-card ${fieldStatusClassName(field.latestStatus)}`}
              data-status-label={fieldStatusLabel(field.latestStatus)}
            >
              <input
                type="checkbox"
                checked={selectedFieldSeasonIds.includes(field.fieldSeasonId)}
                onChange={() => toggle(field.fieldSeasonId)}
              />
              <span className="field-list-main">
                <span className="field-list-title">{field.fieldKey}</span>
                <span className="field-list-meta">
                  {formatArea(field.areaHa)} · {field.cropName ?? 'нет культуры'}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </aside>
  );
}
