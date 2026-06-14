import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AUTH_REQUIRED_EVENT } from '../../shared/api/httpClient';
import { createAuthClient } from './authClient';
import { AUTH_SERVER_UNAVAILABLE_MESSAGE, authLoginErrorMessage } from './authErrors';
import type { AuthClient, AuthState, LoginCredentials } from './types';

type AuthContextValue = {
  state: AuthState;
  isLoading: boolean;
  user: Extract<AuthState, { status: 'authenticated' }>['user'] | null;
  login: (credentials: LoginCredentials, returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authClientRef = useRef<AuthClient>(createAuthClient());
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const user = await authClientRef.current.getCurrentUser();
      setState(user ? { status: 'authenticated', user } : { status: 'anonymous' });
    } catch {
      setState({
        status: 'error',
        message: AUTH_SERVER_UNAVAILABLE_MESSAGE
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleAuthRequired = () => {
      setState({ status: 'anonymous' });
    };

    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    };
  }, []);

  const login = useCallback(
    async (credentials: LoginCredentials, returnTo?: string) => {
      try {
        await authClientRef.current.login(credentials, returnTo);
        await refresh();
      } catch (error) {
        throw new Error(authLoginErrorMessage(error));
      }
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await authClientRef.current.logout();
    } finally {
      setState({ status: 'anonymous' });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      isLoading: state.status === 'loading',
      user: state.status === 'authenticated' ? state.user : null,
      login,
      logout,
      refresh
    }),
    [state, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
