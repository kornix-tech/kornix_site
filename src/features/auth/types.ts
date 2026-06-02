export type AuthRole = 'farm_operator' | 'viewer';

export type AuthUser = {
  id: string;
  displayName: string;
  email?: string;
  organizationCode: 'SP';
  organizationName: string;
  roles: AuthRole[];
};

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'anonymous' }
  | { status: 'error'; message: string };

export type LoginCredentials = {
  username: string;
  password: string;
};

export type AuthClient = {
  getCurrentUser(): Promise<AuthUser | null>;
  login(credentials: LoginCredentials, returnTo?: string): Promise<void>;
  logout(): Promise<void>;
};

export type AuthMode = 'mock' | 'bff';
