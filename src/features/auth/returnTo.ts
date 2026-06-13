const DEFAULT_RETURN_TO = '/fields/sp/2026';
const LEGACY_RETURN_PATHS = new Set(['/map', '/water-regime', '/irrigation', '/workspace']);
const FRIENDLY_RETURN_PATH_PATTERN = /^\/(?:fields|water-regime|irrigation-input)\/[a-z0-9-]{1,32}\/\d{4}$/;

function isAllowedReturnPath(pathname: string): boolean {
  return LEGACY_RETURN_PATHS.has(pathname) || FRIENDLY_RETURN_PATH_PATTERN.test(pathname);
}

export function normalizeReturnTo(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_RETURN_TO;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !isAllowedReturnPath(url.pathname)) {
      return DEFAULT_RETURN_TO;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_RETURN_TO;
  }
}
