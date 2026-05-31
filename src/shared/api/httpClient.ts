export type ApiErrorCode = 'auth_required' | 'forbidden' | 'http_error' | 'invalid_json';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;

  constructor(code: ApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const REQUEST_TIMEOUT_MS = 30_000;
export const AUTH_REQUIRED_EVENT = 'kornix:auth-required';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function buildUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new ApiError('http_error', 'Некорректный относительный путь API.');
  }

  return apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path;
}

function csrfTokenFromCookie(): string | null {
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('kornix_csrf='));

  return cookie ? decodeURIComponent(cookie.slice('kornix_csrf='.length)) : null;
}

function csrfToken(): string | null {
  return document.querySelector<HTMLMetaElement>('meta[name="kornix-csrf-token"]')?.content || csrfTokenFromCookie();
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = init.signal ? null : new AbortController();
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : undefined;

  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', headers.get('Accept') ?? 'application/json');
  headers.set('X-Requested-With', headers.get('X-Requested-With') ?? 'XMLHttpRequest');

  const token = UNSAFE_METHODS.has(method) ? csrfToken() : null;
  if (token && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', token);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      // Cookie-based BFF session требует credentials: include. В mock-режиме этот флаг безвреден.
      credentials: 'include',
      signal: init.signal ?? controller?.signal,
      headers
    });
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
    throw new ApiError('auth_required', 'Требуется авторизация.', response.status);
  }

  if (response.status === 403) {
    throw new ApiError('forbidden', 'Недостаточно прав для выполнения запроса.', response.status);
  }

  if (!response.ok) {
    throw new ApiError(
      'http_error',
      `API ${response.status}: ${response.statusText || 'ошибка запроса.'}`,
      response.status
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiError(
      'invalid_json',
      error instanceof Error ? `API вернул некорректный JSON: ${error.message}` : 'API вернул некорректный JSON.',
      response.status
    );
  }
}
