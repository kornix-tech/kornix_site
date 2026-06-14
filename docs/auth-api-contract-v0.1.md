# KORNIX Auth API Contract v0.1

> Note: auth endpoints remain `/api/v1`, but historical `/api/v2/kornix/*`
> examples in this document are archived. Current calculation data contract is
> `/api/v2/kornix/*`.

## Целевой паттерн

Production-авторизация строится через Backend-for-Frontend/session backend:

```text
User -> frontend /login -> backend login endpoint -> OIDC provider
     -> backend callback -> server-side session
     -> HttpOnly Secure SameSite cookie -> frontend /api/v2/me
```

Frontend не хранит access token, refresh token, JWT, client secret или session id в
`localStorage` / `sessionStorage`. Все реальные запросы к backend выполняются с
`credentials: include`.

## GET /api/v2/me

Возвращает текущего пользователя в рамках server-side session.

### 200

```json
{
  "id": "user_123",
  "displayName": "Иван Петров",
  "email": "ivan@example.com",
  "organizationId": "org_123",
  "organizationName": "СП",
  "farmId": "farm_123",
  "roles": ["farm_operator"]
}
```

### Ответы

```text
200 authenticated
401 anonymous / session expired
403 authenticated but forbidden
500 technical error
```

## GET /api/v2/auth/login

Backend перенаправляет пользователя к OIDC provider.

Query:

```text
returnTo=/water-regime?fields=...
```

Backend обязан валидировать `returnTo`, чтобы исключить open redirect. Разрешать
следует только относительные frontend-пути или заранее утверждённые origin.
Frontend дополнительно нормализует `returnTo` и пропускает только внутренние
маршруты `/map`, `/water-regime` и совместимый `/workspace`.

## Frontend release guard

На публичном hostname frontend принудительно использует BFF-flow даже если

## POST /api/v2/auth/logout

Очищает server-side session. Допустимо дополнительно выполнять redirect на
frontend `/login`, если backend выбирает redirect-based logout.

## Cookie requirements

```text
HttpOnly
Secure in production
SameSite=Lax or Strict
Path=/
No broad Domain unless explicitly required
Reasonable session TTL
Session rotation after login
```

## CSRF

Если cookie-based session используется для `POST` / `PUT` / `PATCH` / `DELETE`,
backend должен внедрить CSRF protection. SameSite сам по себе не является полной
CSRF-стратегией. Минимальный baseline: `Origin` / `Referer` checks и CSRF token
для небезопасных методов либо BFF-specific anti-CSRF pattern.

## Tenant scope

`organizationId` из `/api/v2/me` используется frontend только для отображения.
Frontend не должен посылать `organizationId` как доверенный security filter.

Запрещённый паттерн:

```http
GET /api/v2/kornix/field-seasons/map?organizationId=org_123
```

Предпочтительный паттерн:

```http
GET /api/v2/kornix/current-context
GET /api/v2/kornix/field-seasons/map?seasonYear=2026
```

Backend сам применяет tenant filter из authenticated session/claims.
