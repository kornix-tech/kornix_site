# CODEX INSTRUCTION — развернуть KORNIX frontend в WSL/Docker и подготовить к VDS

## 0. Цель

Развернуть frontend KORNIX в контейнере Docker внутри WSL так, чтобы web UI был доступен из Windows по локальному адресу. После проверки эта же структура должна переноситься на удалённый VDS без изменения архитектуры проекта.

## 1. Входной артефакт

Ожидается ZIP-архив с каталогом:

```text
kornix-frontend/
```

Внутри есть:

```text
Dockerfile
nginx.conf
docker-compose.yml
docker-compose.dev.yml
package.json
src/
doc/
.env.example
.env.vds.example
README.md
```

## 2. Предварительные условия

Команды выполняются в WSL Linux shell.

Проверить:

```bash
docker --version
docker compose version
```

Docker daemon должен быть доступен из WSL.

## 3. Распаковка

```bash
mkdir -p ~/kornix
cd ~/kornix
unzip /path/to/kornix-frontend-container-scaffold.zip
cd kornix-frontend
```

Если каталог уже существует, не перетирать его без backup.

## 4. Первый production-like запуск через Nginx

```bash
cp .env.example .env
docker compose build
docker compose up -d
docker compose ps
curl -I http://127.0.0.1:${KORNIX_FRONTEND_PORT:-8080}
```

Ожидаемый результат:

```text
HTTP/1.1 200 OK
```

Из Windows открыть:

```text
http://localhost:8080
```

Если порт 8080 занят, изменить в `.env`:

```env
KORNIX_FRONTEND_PORT=8081
```

Затем:

```bash
docker compose up -d --build
```

## 5. Dev-режим с hot reload

Для разработки через Vite:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Открыть из Windows:

```text
http://localhost:5173
```

Если hot reload в WSL работает нестабильно, оставить `CHOKIDAR_USEPOLLING=true` в `docker-compose.dev.yml`.

## 6. Проверка frontend-функциональности

После открытия UI проверить:

1. `/login` открывается.
2. Кнопка входа переводит в `/map`.
3. Вкладка `Карта` показывает поля.
4. Наведение на поле показывает tooltip водного режима.
5. Click по полю переводит на `/water-regime`.
6. Слева от графика есть чекбоксы полей.
7. При выборе нескольких полей график показывает area-weighted aggregate.
8. URL содержит только нужные параметры: `fields`, `from`, `to` или `day`.

## 7. Auth/API и подключение backend

```env
VITE_API_BASE_URL=http://localhost:8000
```

Затем пересобрать production frontend:

```bash
docker compose build --no-cache
docker compose up -d
```

Важно: переменные `VITE_*` встраиваются на этапе build. При их изменении production image нужно пересобирать.

## 8. Перенос на VDS

На VDS установить Docker и Docker Compose plugin. Затем:

```bash
scp kornix-frontend-container-scaffold.zip user@vds:/opt/kornix/
ssh user@vds
cd /opt/kornix
unzip kornix-frontend-container-scaffold.zip
cd kornix-frontend
cp .env.vds.example .env
```

Проверить `.env`:

```env
KORNIX_FRONTEND_BIND=0.0.0.0
KORNIX_FRONTEND_PORT=80
VITE_API_BASE_URL=https://<backend-domain-or-ip>
```

Запуск:

```bash
docker compose up -d --build
docker compose ps
curl -I http://127.0.0.1:${KORNIX_FRONTEND_PORT:-80}
```

Если на VDS используется внешний reverse proxy, не публиковать контейнер на `0.0.0.0:80`. Оставить:

```env
KORNIX_FRONTEND_BIND=127.0.0.1
KORNIX_FRONTEND_PORT=8080
```

И проксировать внешний домен на `http://127.0.0.1:8080`.

## 9. Безопасность

Не коммитить `.env` с production URL/secrets. В frontend не должно быть DB-секретов, `client secret`, JWT, access token или refresh token. Frontend получает только публичный API base URL. Авторизация должна быть через внешний provider/backend session с `HttpOnly; Secure; SameSite` cookie, а tenant boundary обязан enforced на backend.

## 10. Acceptance report для Codex

В конце вывести отчёт:

```text
status: DEPLOYED_LOCAL / NOT_DEPLOYED
commands_executed:
  - docker --version: ...
  - docker compose version: ...
  - docker compose build: PASS/FAIL
  - docker compose up -d: PASS/FAIL
  - curl -I http://127.0.0.1:<port>: PASS/FAIL
local_windows_url: http://localhost:<port>
mode: production-like nginx / vite dev
notes:
  - ...
```

Не писать `DONE`, если контейнер не поднят и HTTP-проверка не прошла.
