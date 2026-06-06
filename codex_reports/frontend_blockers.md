# KORNIX Frontend Baseline Blockers

## Blocking / limiting items

- WSL PATH does not contain `node`, `npm`, `pnpm` or `yarn`; local `npm ci` was not possible in the requested shell environment.
- Bundled Windows `node.exe` successfully ran TypeScript, but local Vite build failed because WSL `node_modules` does not contain the Windows Rollup optional native package `@rollup/rollup-win32-x64-msvc`.
- `package.json` has no `lint` or `test` scripts, so lint/tests are not configured in this snapshot.
- Backend smoke reached `http://localhost:8001/api/v1/health`, but `GET /api/v2/kornix/current-context` returned `SESSION_REQUIRED`; authenticated integration smoke requires a valid backend session.

## Not blockers

- Production Docker build completed successfully and executed `npm ci`, `npm run typecheck` and Vite production build inside the Linux Node image.
- Static contract/security scan passed for runtime `src`: no legacy `/api/v1/kornix`, no backend-admin API calls, and no token-storage patterns were found.
- Security documentation files under `doc/security/` exist and contain material baseline content.
