# KORNIX Frontend Big Bang Final Report

## Итог

Статус: NOT_READY_BIG_BANG_FRONTEND_GAP

## Краткое резюме

Frontend-код переведён на пользовательский контракт `/api/v2/kornix`: auth endpoints сохранены на `/api/v1`, рабочий KORNIX flow больше не использует legacy `/api/v1/kornix`, добавлены method selector, current-context v2 state, approval workflow, no-zero policy и contract-check в validate. Финальный READY не заявлен, потому что live/browser smoke против backend API недоступен: `127.0.0.1:8000` не принимает соединение.

## Git

Branch: main
Commit: 099630d Prepare frontend for KORNIX API v2
Dirty status: yes
Untracked files: codex_reports/
Remote pushed: yes for commit 099630d; report files are currently local/uncommitted

## Изменённые файлы

Последний pushed frontend commit изменил:

```text
Changed files in HEAD commit:
commit 099630df2473ebf4ad1d61f289f1cef4306da53a
subject Prepare frontend for KORNIX API v2

.env.integration.example
CHANGELOG.md
README.md
docker-compose.dev.yml
scripts/check-frontend-contract.sh
scripts/validate.sh
src/api/kornixApi.ts
src/api/mockData.ts
src/styles.css
src/types/kornix.ts
src/workspace/IrrigationInputTable.tsx
src/workspace/WaterRegimeChart.tsx
src/workspace/WorkspacePage.tsx
src/workspace/workspaceUrlState.ts
```

Дополнительно созданы локальные report files в `codex_reports/`.

## API migration

- `/api/v1/me` сохранён для BFF/session auth.
- `/api/v1/auth/*` сохранены для CSRF, login/logout и session flow.
- Пользовательские KORNIX calculation calls переведены на `/api/v2/kornix/*`.
- Старый `/api/v1/kornix/water-regime/calculate` flow удалён из production workspace и блокируется `scripts/check-frontend-contract.sh`.

## Current context v2

Workspace использует `currentAppliedCalculationRunId` как основной отображаемый run. `currentOperationalBaseCalculationRunId` остаётся справочным полем из context. UI учитывает `frontendMode`, `submitAllowed`, `submitBlockedReason`, `readinessSummary`, backend-issued `managedScope`, `availableMethods` и `defaultMethodCode`.

## Method selector

`selectedMethodCode` берётся из backend default и синхронизируется с URL query `methodCode`. Если URL содержит недоступный метод, frontend откатывается на backend default и показывает предупреждение. Map/profile calls передают `methodCode`; экспорт данных включает method code/label.

## Approval workflow

Submit отправляет `baseCalculationRunId`, `managedScope`, `irrigationLayer` и `clientDiff` на `/api/v2/kornix/water-regime/approvals`. Реализованы обработка reused/no changes, polling при `pollRequired`, переключение на applied calculation run и запрет переключения active view при failed approval.

## No-zero policy

`0 мм` не сериализуется и очищается как пустое значение. Пустая ячейка означает отсутствие полива. `irrigationLayer` содержит только значения `irrigationMm > 0`.

## Stale read-only

`frontendMode=stale_read_only` и `not_ready` блокируют редактирование и submit без logout. UI показывает backend reason через `submitBlockedReason` или локальную validation-причину.

## Map/profile

Map/profile вызываются только с `calculationRunId + methodCode`, где run берётся из `currentAppliedCalculationRunId`. Catalog placeholder не уходит в backend map/profile. Profile не использует hardcoded `2026-06-07` или expected `68` points; пропуски не заполняются нулями.

## Errors

`ApiError` сохраняет backend error envelope `code/message/details/requestId`; `401` переводит UI в auth-required state, `403` показывает insufficient permissions, остальные ошибки отображают code/message/requestId.

## Checks

| Проверка | Команда | Статус | Лог/файл |
|---|---|---|---|
| npm ci | `npm ci --no-audit --no-fund` | PASS | `codex_reports/kornix_frontend_test_log.txt` |
| TypeScript | `npm run typecheck` | PASS | `codex_reports/kornix_frontend_test_log.txt` |
| Build | `npm run build` | PASS | `codex_reports/kornix_frontend_test_log.txt` |
| Validate | `./scripts/validate.sh` | PASS | `codex_reports/kornix_frontend_test_log.txt` |
| Contract check | `./scripts/check-frontend-contract.sh` | PASS | `codex_reports/kornix_frontend_test_log.txt` |

## Browser smoke

Browser/live smoke не выполнен: backend API на `http://127.0.0.1:8000` недоступен. Предыдущие curl-проверки `/api/v1/me` и `/api/v2/kornix/current-context` завершились connection refused.

## Known limitations

- Report files сейчас локальные/uncommitted, если их нужно включить в репозиторий, требуется отдельный commit/push.
- Без backend нельзя подтвердить реальные DTO, session cookies, CSRF exchange, map/profile payloads и approval polling.

## Что не проверено

- BFF login/session flow in browser against real backend.
- GET /api/v2/kornix/current-context live response semantics.
- Map/profile live calls with currentAppliedCalculationRunId + methodCode.
- Approval submit and polling against real backend.
- stale_read_only mode from real backend context.

## Следующие шаги

- Поднять backend API на `http://localhost:8000`.
- Запустить `make integration-dev`.
- Выполнить browser smoke по `/api/v1/me`, `/api/v2/kornix/current-context`, map/profile и approval workflow.
- После PASS обновить `codex_reports/kornix_frontend_smoke_summary.json` и финальный статус.
