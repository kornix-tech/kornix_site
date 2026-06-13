import type { FieldWaterRegimeStatusCode } from '../types/kornix';

const statusLabels: Record<FieldWaterRegimeStatusCode, string> = {
  ok: 'Влагозапасы в норме',
  warning: 'Требуется анализ',
  critical: 'Нужен полив',
  no_data: 'Состояние поля: нет данных',
  not_calculated: 'Состояние поля: нет расчёта',
  calculation_failed: 'Состояние поля: ошибка расчёта'
};

export function fieldStatusLabel(status: FieldWaterRegimeStatusCode): string {
  return statusLabels[status];
}

export function fieldStatusClassName(status: FieldWaterRegimeStatusCode): string {
  return `field-status-${status}`;
}
