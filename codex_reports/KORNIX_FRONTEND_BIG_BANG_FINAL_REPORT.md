# KORNIX Frontend Big Bang Final Report

## Итог

Статус: NOT_READY_API_V2_FRONTEND_STUB_STITCHING_GAP

## Краткое резюме

Frontend подготовлен к API v2 stitching на stub-расчётах: KORNIX-запросы идут на `/api/v2/kornix`, auth остаётся на `/api/v1`, таблица поливов загружает backend active projection из `/api/v2/kornix/irrigation-layer/current`, editable scope ограничен backend `managedScope`, а `clientDiff` считается от backend projection. Статус не READY, потому что backend stub API на `127.0.0.1:8000` недоступен и визуальная проверка stub transition `1.0 -> 2.0` не выполнена.

## Git

Branch: main
Commit: bb74ba0 Add frontend big bang final reports
Dirty status: yes
Untracked files: none
Remote pushed: no for current working tree

## Изменённые файлы

```text
Changed files in working tree against HEAD:
CHANGELOG.md
README.md
codex_reports/kornix_frontend_changed_files.txt
codex_reports/kornix_frontend_git_status.txt
codex_reports/kornix_frontend_test_log.txt
scripts/check-frontend-contract.sh
src/api/kornixApi.ts
src/api/mockData.ts
src/types/kornix.ts
src/workspace/IrrigationInputTable.tsx
```

## API migration

- `/api/v1/me` сохранён для BFF/session auth.
- `/api/v1/auth/*` сохранены для CSRF, login/logout и session flow.
- Пользовательские KORNIX calls используют `/api/v2/kornix/*`.
- Старый `/api/v1/kornix/water-regime/calculate` не используется и блокируется contract-check.
- `/api/admin/v1` и `/admin` отсутствуют в пользовательском `src`.

## Current context v2

Workspace использует `currentAppliedCalculationRunId` как отображаемый run, читает `currentOperationalBaseCalculationRunId` только как справочное поле и учитывает `frontendMode`, `submitAllowed`, `submitBlockedReason`, `readinessSummary`, backend-issued `managedScope`, `availableMethods`, `defaultMethodCode`.

## Method selector

`selectedMethodCode` берётся из URL только если он есть в `availableMethods`; иначе используется backend `defaultMethodCode`. Map/profile calls передают `methodCode`, изменение метода инвалидирует соответствующие React Query ключи. DTO `/methods` поддерживает новый объектный response и legacy `displayName/methodVersion` adapter.

## Approval workflow

Submit отправляет `baseCalculationRunId`, `managedScope`, положительный `irrigationLayer` и `clientDiff` на `/api/v2/kornix/water-regime/approvals`. Реализованы no-op/reused, 202 polling, applied switch на новый run и failed behavior без переключения active view.

## No-zero policy

`0 мм`, отрицательные и NaN значения нормализуются в пустое значение. Пустая ячейка означает отсутствие полива. Перед submit проверяется, что все `irrigationMm > 0`.

## Stale read-only

`stale_read_only` и `not_ready` блокируют submit и редактирование, но допускают чтение map/profile при наличии валидного displayed run. Причина блокировки показывается через backend `submitBlockedReason` или локальное validation-сообщение.

## Map/profile

Map/profile вызываются только с `calculationRunId=currentApplied/displayed run` и выбранным `methodCode`. Catalog placeholder не уходит в backend. В production code нет hardcoded `2026-06-07` или expected `68` points.

## Errors

`ApiError` сохраняет `code`, `message`, `status`, `details`, `requestId`. UI показывает code/message/requestId для operator-readable diagnostics. `401` переводит auth state в anonymous, `403` отображается как forbidden, domain/service errors показываются из backend envelope.

## Checks

| Проверка | Команда | Статус | Лог/файл |
|---|---|---|---|
| npm ci | `npm ci --no-audit --no-fund` | PASS | `codex_reports/kornix_frontend_test_log.txt` |
| TypeScript | `npm run typecheck` | PASS | `codex_reports/kornix_frontend_test_log.txt` |
| Build | `npm run build` | PASS | `codex_reports/kornix_frontend_test_log.txt` |
| Validate | `./scripts/validate.sh` | PASS | `codex_reports/kornix_frontend_test_log.txt` |
| npm test | `npm test` | NOT_RUN | `codex_reports/kornix_frontend_test_log.txt` |

## Browser smoke

Browser/live smoke не выполнен: backend stub API на `http://127.0.0.1:8000` недоступен. Curl-проверки `/api/v1/me`, `/api/v2/kornix/current-context` и `/api/v2/kornix/irrigation-layer/current` завершились connection refused.

## Known limitations

- Stub values `1.0` baseline и `2.0` after approval не подтверждены live backend response.
- Текущий working tree не запушен после stub-stitching правок.
- Real water regime engine остаётся pending по условию задачи.

## Что не проверено

- GET /api/v1/me against backend stub API.
- GET /api/v2/kornix/current-context against backend stub API.
- GET /api/v2/kornix/irrigation-layer/current active projection.
- Browser method selector with live availableMethods.
- Baseline map/profile sample values equal 1.0.
- Approval submit, polling, applied transition and new run switch.
- Post-approval map/profile sample values equal 2.0.
- stale_read_only mode from real backend context.

## Следующие шаги

- Поднять backend stub API на `http://localhost:8000`.
- Запустить `make integration-dev`.
- Выполнить browser smoke: current-context, methods, irrigation-layer/current, map/profile baseline `1.0`, approval polling, map/profile after approval `2.0`.
- После PASS обновить `codex_reports/kornix_frontend_smoke_summary.json` и статус на `KORNIX_API_V2_FRONTEND_STITCHING_READY_WITH_STUB_ENGINE`.
