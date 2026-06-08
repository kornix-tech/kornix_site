# KORNIX Frontend Editable Approval UAT

## Status

KORNIX_FRONTEND_EDITABLE_APPROVAL_UAT_READY

## Scope

- Frontend base URL: `http://localhost:5173`
- API mode: live same-origin `/api`, `VITE_ENABLE_MOCK_API=false`, `VITE_AUTH_MODE=bff`
- Organization: `SP`
- Season: `2026`
- Backend handoff commit observed: `8fa9fae814d7b1ac546a8f9c869293277e769603`

## Evidence

- `npm ci`: PASS
- Syntax check for `scripts/frontend_editable_approval_uat_smoke.mjs`: PASS
- Typecheck: PASS
- Build: PASS via direct `vite build` after separate typecheck; WSL has no system `npm`, so temporary npm CLI was used for `npm ci` and script checks.
- Contract test: PASS
- Contract scan: PASS
- Security scan: PASS
- Secret scan: PASS, no literal credentials, cookies, CSRF values or temporary browser password found in committed reports.
- Live smoke: PASS
- Browser UI proof: PASS

## Live Smoke Summary

- Current context: `current_editable`, `submitAllowed=true`
- Map features: 37
- Profile metrics: 13
- `shortwave_radiation_daily_mj_m2`: present
- Approval POST with session-bound CSRF: PASS
- Approval readback: PASS
- Missing CSRF rejected: PASS
- Out-of-scope field rejected: PASS
- Season mismatch rejected: PASS
- Ephemeral backend smoke user deactivated and sessions revoked: PASS

## Browser UI Proof

- Login used BFF session flow with no token storage.
- Editable table loaded live backend context.
- At least one editable irrigation cell was changed.
- Approval action was triggered from the browser UI.
- Readback switched the visible approval button to `irrigation-approve-approved` and showed a new live calculation run.
- The `submitAllowed=false` UI branch is covered by implementation gating: inputs are readonly unless `frontendMode=current_editable` and `submitAllowed=true`.

## Artifacts

- `codex_reports/frontend_editable_approval_uat_report.json`
- `codex_reports/frontend_editable_approval_uat_smoke.json`
- `codex_reports/frontend_editable_approval_uat_contract_map.json`
- `codex_reports/frontend_editable_approval_uat_browser_ui_proof.json`
- `codex_reports/frontend_editable_approval_uat_smoke_log.txt`
- `codex_reports/frontend_editable_approval_uat_npm_ci_log.txt`
- `codex_reports/frontend_editable_approval_uat_typecheck_log.txt`
- `codex_reports/frontend_editable_approval_uat_build_log.txt`
- `codex_reports/frontend_editable_approval_uat_contract_test_log.txt`
- `codex_reports/frontend_editable_approval_uat_contract_scan_log.txt`
- `codex_reports/frontend_editable_approval_uat_security_scan_log.txt`
- `codex_reports/frontend_editable_approval_uat_secret_scan_log.txt`
