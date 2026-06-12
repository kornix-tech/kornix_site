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
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExportGraphics() {
    setIsExportingGraphics(true);
    setExportError(null);
    try {
      await onExportGraphics();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Не удалось экспортировать графику.');
    } finally {
      setIsExportingGraphics(false);
    }
  }

  function handleExportData() {
    setExportError(null);
    try {
      onExportData();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Не удалось экспортировать данные.');
    }
  }

  return (
    <div className="export-actions" data-export-hidden="true">
      <button type="button" onClick={() => void handleExportGraphics()} disabled={isExportingGraphics}>
        {isExportingGraphics ? 'Экспорт…' : 'Экспорт графики'}
      </button>
      <button type="button" onClick={handleExportData} disabled={dataDisabled}>
        Экспорт данных
      </button>
      {exportError && <span className="export-error">{exportError}</span>}
    </div>
  );
}
