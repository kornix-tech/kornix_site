import { ApiError, apiBaseUrl, requestJson } from '../../shared/api/httpClient';
import { normalizeReturnTo } from './returnTo';
import type { AuthClient, AuthUser } from './types';

export class BffSessionAuthClient implements AuthClient {
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      return await requestJson<AuthUser>('/api/v1/me');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'auth_required') {
        return null;
      }
      throw error;
    }
  }

  async login(returnTo?: string): Promise<void> {
    const query = new URLSearchParams({ returnTo: normalizeReturnTo(returnTo) });
    window.location.href = new URL(`/api/v1/auth/login?${query.toString()}`, apiBaseUrl || window.location.origin)
      .toString();
  }

  async logout(): Promise<void> {
    await requestJson<void>('/api/v1/auth/logout', { method: 'POST' });
  }
}
