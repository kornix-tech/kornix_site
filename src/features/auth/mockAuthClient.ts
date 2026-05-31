import type { AuthClient, AuthUser } from './types';

const MOCK_SESSION_KEY = 'kornix.mock.authenticated';

export const mockAuthUser: AuthUser = {
  id: 'mock-user-1',
  displayName: 'Demo User',
  email: 'demo@kornix.local',
  organizationId: 'org-demo',
  organizationName: 'KORNIX Demo Farm',
  farmId: 'farm-demo',
  roles: ['admin']
};

export class MockAuthClient implements AuthClient {
  async getCurrentUser(): Promise<AuthUser | null> {
    return window.sessionStorage.getItem(MOCK_SESSION_KEY) === 'true' ? mockAuthUser : null;
  }

  async login(): Promise<void> {
    // Храним только dev-флаг mock-сессии, не токен и не идентификатор сессии.
    window.sessionStorage.setItem(MOCK_SESSION_KEY, 'true');
  }

  async logout(): Promise<void> {
    window.sessionStorage.removeItem(MOCK_SESSION_KEY);
  }
}
