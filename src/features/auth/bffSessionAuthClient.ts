import { ApiError, requestJson } from '../../shared/api/httpClient';
import type { AuthClient, AuthUser, LoginCredentials } from './types';

export class BffSessionAuthClient implements AuthClient {
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      return await requestJson<AuthUser>('/api/v2/me');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'auth_required') {
        return null;
      }
      throw error;
    }
  }

  async login(credentials: LoginCredentials): Promise<void> {
    await requestJson<void>('/api/v2/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });
  }

  async logout(): Promise<void> {
    await requestJson<void>('/api/v2/auth/logout', { method: 'POST' });
  }
}
