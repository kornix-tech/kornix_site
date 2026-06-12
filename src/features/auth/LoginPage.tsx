import { FormEvent, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { normalizeReturnTo } from './returnTo';
import { useAuth } from './useAuth';

export function LoginPage() {
  const { authMode, state, login } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = normalizeReturnTo(searchParams.get('returnTo'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (state.status === 'authenticated') {
    return <Navigate to={returnTo} replace />;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);
    try {
      await login({ username, password }, returnTo);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Не удалось выполнить вход.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={(event) => void handleLogin(event)}>
        <div className="brand-lockup">
          <span className="brand-mark">
            <img src="/brand/kornix-logo.png" alt="" />
          </span>
          <span>
            <strong>КОРНИКС</strong>
            <small>Технологии</small>
          </span>
        </div>
        <h1>КОРНИКС</h1>
        <p>Вход в систему мониторинга водного режима</p>
        <label className="login-field">
          <span>Логин</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required={authMode !== 'mock'}
          />
        </label>
        <label className="login-field">
          <span>Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required={authMode !== 'mock'}
          />
        </label>
        {loginError && <div className="login-error">{loginError}</div>}
        <button className="primary-button" type="submit" disabled={state.status === 'loading' || isSubmitting}>
          {isSubmitting ? 'Входим...' : authMode === 'mock' ? 'Войти в демо-режиме' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
