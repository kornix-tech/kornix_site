import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AUTH_REQUIRED_EVENT } from '../../shared/api/httpClient';
import { createAuthClient, getAuthMode } from './authClient';
import type { AuthClient, AuthState } from './types';

type AuthContextValue = {
  authMode: ReturnType<typeof getAuthMode>;
  state: AuthState;
  isLoading: boolean;
  user: Extract<AuthState, { status: 'authenticated' }>['user'] | null;
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authClientRef = useRef<AuthClient>(createAuthClient());
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const authMode = getAuthMode();

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const user = await authClientRef.current.getCurrentUser();
      setState(user ? { status: 'authenticated', user } : { status: 'anonymous' });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось проверить авторизацию.'
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
    async (returnTo?: string) => {
      await authClientRef.current.login(returnTo);
      if (authMode === 'mock') {
        await refresh();
      }
    },
    [authMode, refresh]
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
      authMode,
      state,
      isLoading: state.status === 'loading',
      user: state.status === 'authenticated' ? state.user : null,
      login,
      logout,
      refresh
    }),
    [authMode, state, login, logout, refresh]
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
