import { Navigate, useSearchParams } from 'react-router-dom';
import { normalizeReturnTo } from './returnTo';
import { useAuth } from './useAuth';

export function LoginPage() {
  const { authMode, state, login } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = normalizeReturnTo(searchParams.get('returnTo'));

  if (state.status === 'authenticated') {
    return <Navigate to={returnTo} replace />;
  }

  function handleLogin() {
    void login(returnTo);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-lockup">
          <span className="brand-mark">
            <img src="/brand/kornix-logo.png" alt="" />
          </span>
          <span>
            <strong>KORNIX</strong>
            <small>WATER INTELLIGENCE</small>
          </span>
        </div>
        <h1>KORNIX</h1>
        <p>Вход в систему мониторинга водного режима</p>
        <button className="primary-button" type="button" onClick={handleLogin} disabled={state.status === 'loading'}>
          {authMode === 'mock' ? 'Войти в демо-режиме' : 'Войти'}
        </button>
      </section>
    </main>
  );
}
