type BackendWarning = {
  code: string;
  message: string;
};

const HIDDEN_SERVICE_WARNING_CODES = new Set([
  'BIG_BANG_NOT_PUBLISHED',
  'RH_MIN_MAX_NOT_AVAILABLE',
  'SP37_GROUP_PUBLICATION_READ_ONLY',
  'WIND_GUST_NOT_AVAILABLE'
]);

export function isServiceWarningCode(code: string | null | undefined): boolean {
  return Boolean(code && HIDDEN_SERVICE_WARNING_CODES.has(code));
}

export function visibleUserWarnings<T extends BackendWarning>(warnings: T[]): T[] {
  return warnings.filter((warning) => !isServiceWarningCode(warning.code));
}
