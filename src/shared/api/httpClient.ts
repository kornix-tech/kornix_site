export type ApiErrorCode =
  | 'auth_required'
  | 'forbidden'
  | 'http_error'
  | 'invalid_json'
  | 'csrf_token_missing'
  | (string & {});

type BackendErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(code: ApiErrorCode, message: string, status?: number, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = REQUEST_TIMEOUT_MS;
export const AUTH_REQUIRED_EVENT = 'kornix:auth-required';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_BOOTSTRAP_PATH = '/api/v1/auth/csrf';

export type KornixRequestInit = RequestInit & {
  timeoutMs?: number;
};

function buildUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new ApiError('http_error', 'Некорректный относительный путь API.');
  }

  if (shouldUseDevApiProxy()) {
    return path;
  }

  return apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path;
}

function shouldUseDevApiProxy(): boolean {
  if (!import.meta.env.DEV || !apiBaseUrl || typeof window === 'undefined') {
    return false;
  }

  try {
    const apiUrl = new URL(apiBaseUrl);
    const frontendUrl = new URL(window.location.origin);
    const isLocalBackend = ['localhost', '127.0.0.1', '::1'].includes(apiUrl.hostname);
    const isDifferentDevOrigin = apiUrl.origin !== frontendUrl.origin;

    // В локальной интеграции backend может не включать CORS для dev-порта Vite.
    // Оставляем VITE_API_BASE_URL как источник правды, но отправляем запросы
    // same-origin на dev-server, где vite.config.ts проксирует /api/* к backend.
    return isLocalBackend && isDifferentDevOrigin;
  } catch {
    return false;
  }
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

async function parseBackendErrorEnvelope(response: Response): Promise<BackendErrorEnvelope['error'] | null> {
  try {
    const body = (await response.clone().json()) as BackendErrorEnvelope;
    return body && typeof body === 'object' && body.error && typeof body.error === 'object' ? body.error : null;
  } catch {
    return null;
  }
}

function authRequiredError(errorEnvelope: BackendErrorEnvelope['error'] | null, status: number): ApiError {
  return new ApiError(
    'auth_required',
    errorEnvelope?.message ?? 'Требуется авторизация.',
    status,
    errorEnvelope?.details,
    errorEnvelope?.requestId
  );
}

async function ensureCsrfToken(path: string): Promise<string | null> {
  const existingToken = csrfToken();
  if (existingToken || path === CSRF_BOOTSTRAP_PATH) {
    return existingToken;
  }

  const response = await fetch(buildUrl(CSRF_BOOTSTRAP_PATH), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
    throw authRequiredError(await parseBackendErrorEnvelope(response), response.status);
  }

  if (!response.ok) {
    const errorEnvelope = await parseBackendErrorEnvelope(response);
    throw new ApiError(
      errorEnvelope?.code ?? 'http_error',
      errorEnvelope?.message ?? `CSRF bootstrap ${response.status}: ${response.statusText || 'ошибка запроса.'}`,
      response.status,
      errorEnvelope?.details,
      errorEnvelope?.requestId
    );
  }

  const nextToken = csrfToken();
  if (!nextToken) {
    throw new ApiError(
      'csrf_token_missing',
      'Backend не выдал CSRF token для небезопасного API-запроса.',
      response.status
    );
  }

  return nextToken;
}

export async function requestJson<T>(path: string, init: KornixRequestInit = {}): Promise<T> {
  const { timeoutMs, ...fetchInit } = init;
  const controller = init.signal ? null : new AbortController();
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS)
    : undefined;

  const method = (fetchInit.method ?? 'GET').toUpperCase();
  const headers = new Headers(fetchInit.headers);
  headers.set('Accept', headers.get('Accept') ?? 'application/json');
  headers.set('X-Requested-With', headers.get('X-Requested-With') ?? 'XMLHttpRequest');

  const token = UNSAFE_METHODS.has(method) ? await ensureCsrfToken(path) : null;
  if (token && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', token);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...fetchInit,
      // Cookie-based BFF session требует credentials: include. В mock-режиме этот флаг безвреден.
      credentials: 'include',
      signal: fetchInit.signal ?? controller?.signal,
      headers
    });
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
    throw authRequiredError(await parseBackendErrorEnvelope(response), response.status);
  }

  if (response.status === 403) {
    const errorEnvelope = await parseBackendErrorEnvelope(response);
    throw new ApiError(
      errorEnvelope?.code ?? 'forbidden',
      errorEnvelope?.message ?? 'Недостаточно прав для выполнения запроса.',
      response.status,
      errorEnvelope?.details,
      errorEnvelope?.requestId
    );
  }

  if (!response.ok) {
    const errorEnvelope = await parseBackendErrorEnvelope(response);
    throw new ApiError(
      errorEnvelope?.code ?? 'http_error',
      errorEnvelope?.message ?? `API ${response.status}: ${response.statusText || 'ошибка запроса.'}`,
      response.status,
      errorEnvelope?.details,
      errorEnvelope?.requestId
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
