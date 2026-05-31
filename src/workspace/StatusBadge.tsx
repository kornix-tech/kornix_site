import type { FieldWaterRegimeStatusCode } from '../types/kornix';

const labels: Record<FieldWaterRegimeStatusCode, string> = {
  ok: 'норма',
  warning: 'внимание',
  critical: 'критично',
  no_data: 'нет данных',
  not_calculated: 'нет расчёта',
  readiness_blocked: 'readiness blocked'
};

export function StatusBadge({ status }: { status: FieldWaterRegimeStatusCode }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
