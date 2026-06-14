import { ApiError } from '../../shared/api/httpClient';

export const AUTH_SERVER_UNAVAILABLE_MESSAGE = 'отсутствует связь с сервером';

export function authLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'auth_required') {
    return error.message;
  }

  return AUTH_SERVER_UNAVAILABLE_MESSAGE;
}
