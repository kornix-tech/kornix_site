import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state, refresh } = useAuth();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  if (state.status === 'loading') {
    return <div className="page-center">Проверка авторизации...</div>;
  }

  if (state.status === 'error') {
    return (
      <div className="page-center">
        <div className="error-state">
          <strong>Не удалось проверить авторизацию.</strong>
          <p>{state.message}</p>
          <button type="button" onClick={() => void refresh()}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'anonymous') {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return <>{children}</>;
}
