import type { FieldWaterRegimeStatusCode } from '../types/kornix';

const statusLabels: Record<FieldWaterRegimeStatusCode, string> = {
  ok: 'Состояние поля: норма',
  warning: 'Состояние поля: внимание',
  critical: 'Состояние поля: критическое',
  no_data: 'Состояние поля: нет данных',
  not_calculated: 'Состояние поля: нет расчёта',
  readiness_blocked: 'Состояние поля: расчёт заблокирован'
};

export function fieldStatusLabel(status: FieldWaterRegimeStatusCode): string {
  return statusLabels[status];
}

export function fieldStatusClassName(status: FieldWaterRegimeStatusCode): string {
  return `field-status-${status}`;
}
