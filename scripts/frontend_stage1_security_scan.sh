#!/usr/bin/env sh
set -eu

echo "== Forbidden runtime endpoints =="
if grep -R --line-number --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=codex_reports \
  -E "/api/v1/kornix|/api/admin/v1|/api/v2/kornix/calculation-runs/.*/status" src; then
  exit 1
fi
echo "PASS: no forbidden/stale runtime endpoints in src"

echo "== Current calculation-run endpoint =="
grep -R --line-number "water-regime/calculation-runs" src/api/kornixApi.ts

echo "== Browser token storage checks =="
if grep -R --line-number --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=codex_reports \
  -E "localStorage\\.(setItem|getItem).*token|sessionStorage\\.(setItem|getItem).*token|indexedDB.*token|accessToken|refreshToken|jwt|JWT" src; then
  exit 1
fi
echo "PASS: no auth token storage patterns in runtime src"

echo "== Harmless storage findings =="
grep -R --line-number --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=codex_reports \
  -E "localStorage|sessionStorage|indexedDB|IndexedDB" src || true
echo "NOTE: sessionStorage is localhost mock flag only; localStorage is non-authoritative irrigation UI draft only."

echo "== Production env defaults =="
grep --line-number "VITE_API_BASE_URL=/api" .env.production.example
grep --line-number "VITE_AUTH_MODE=bff" .env.production.example
grep --line-number "VITE_ENABLE_MOCK_API=false" .env.production.example

echo "== BFF credentials and CSRF =="
grep --line-number "credentials: 'include'" src/shared/api/httpClient.ts
grep --line-number "CSRF_BOOTSTRAP_PATH = '/api/v1/auth/csrf'" src/shared/api/httpClient.ts
grep --line-number "UNSAFE_METHODS" src/shared/api/httpClient.ts
grep --line-number "X-CSRF-Token" src/shared/api/httpClient.ts

echo "== Auth endpoints =="
grep --line-number -E "/api/v1/me|/api/v1/auth/login|/api/v1/auth/logout" src/features/auth/bffSessionAuthClient.ts

echo "== SPA fallback =="
grep --line-number "try_files .*index.html" nginx.conf

echo "== CSP map tile policy =="
grep --line-number "https://\\*.tile.openstreetmap.org" nginx.conf

echo "== Production bundle scan =="
if [ ! -d dist ]; then
  echo "dist not present after build"
  exit 1
fi
if grep -R --line-number \
  -E "localhost:8001|localhost:8002|/api/v1/kornix|/api/admin/v1|/api/v2/kornix/calculation-runs/.*/status|VITE_ENABLE_MOCK_API.:true" dist; then
  exit 1
fi
echo "PASS: production dist has no forbidden/stale markers"
