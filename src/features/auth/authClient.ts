import { BffSessionAuthClient } from './bffSessionAuthClient';
import type { AuthClient } from './types';

export function createAuthClient(): AuthClient {
  return new BffSessionAuthClient();
}
