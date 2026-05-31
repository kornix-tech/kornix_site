type CsvValue = string | number | boolean | null | undefined;

function safeFileNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9А-Яа-я_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}

export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv(fileName: string, csv: string): void {
  downloadTextFile(`${safeFileNamePart(fileName)}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

export async function downloadPagePng(element: HTMLElement, fileName: string): Promise<void> {
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(element, {
    backgroundColor: '#fffdf8',
    cacheBust: true,
    pixelRatio: 2,
    width: element.scrollWidth,
    height: element.scrollHeight,
    filter: (node: HTMLElement) => node.dataset.exportHidden !== 'true'
  });

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${safeFileNamePart(fileName)}.png`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
