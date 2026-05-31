export type AuthRole = 'admin' | 'farm_operator' | 'viewer' | 'service_admin';

export type AuthUser = {
  id: string;
  displayName: string;
  email?: string;
  organizationId: string;
  organizationName?: string;
  farmId?: string;
  roles: AuthRole[];
};

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'anonymous' }
  | { status: 'error'; message: string };

export type AuthClient = {
  getCurrentUser(): Promise<AuthUser | null>;
  login(returnTo?: string): Promise<void>;
  logout(): Promise<void>;
};

export type AuthMode = 'mock' | 'bff';
