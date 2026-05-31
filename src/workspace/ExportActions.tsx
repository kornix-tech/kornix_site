import { useState } from 'react';

export function ExportActions({
  onExportGraphics,
  onExportData,
  dataDisabled = false
}: {
  onExportGraphics: () => Promise<void>;
  onExportData: () => void;
  dataDisabled?: boolean;
}) {
  const [isExportingGraphics, setIsExportingGraphics] = useState(false);

  async function handleExportGraphics() {
    setIsExportingGraphics(true);
    try {
      await onExportGraphics();
    } finally {
      setIsExportingGraphics(false);
    }
  }

  return (
    <div className="export-actions" data-export-hidden="true">
      <button type="button" onClick={() => void handleExportGraphics()} disabled={isExportingGraphics}>
        {isExportingGraphics ? 'Экспорт…' : 'Экспорт графики'}
      </button>
      <button type="button" onClick={onExportData} disabled={dataDisabled}>
        Экспорт данных
      </button>
    </div>
  );
}
