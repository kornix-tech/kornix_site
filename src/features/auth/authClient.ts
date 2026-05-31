import { BffSessionAuthClient } from './bffSessionAuthClient';
import { MockAuthClient } from './mockAuthClient';
import type { AuthClient, AuthMode } from './types';
import { isMockRuntimeAllowed } from '../../config/runtimeSafety';

export function getAuthMode(): AuthMode {
  if (import.meta.env.VITE_AUTH_MODE === 'mock' && isMockRuntimeAllowed()) {
    return 'mock';
  }

  return 'bff';
}

export function createAuthClient(): AuthClient {
  return getAuthMode() === 'bff' ? new BffSessionAuthClient() : new MockAuthClient();
}
