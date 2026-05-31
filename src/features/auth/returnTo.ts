const DEFAULT_RETURN_TO = '/map';
const ALLOWED_RETURN_PATHS = new Set(['/map', '/water-regime', '/irrigation', '/workspace']);

export function normalizeReturnTo(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_RETURN_TO;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !ALLOWED_RETURN_PATHS.has(url.pathname)) {
      return DEFAULT_RETURN_TO;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_RETURN_TO;
  }
}
