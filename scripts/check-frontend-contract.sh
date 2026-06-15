#!/usr/bin/env sh
set -eu

check_absent() {
  pattern="$1"
  message="$2"
  if grep -R -n -E "$pattern" src >/tmp/kornix-contract-grep.txt; then
    cat /tmp/kornix-contract-grep.txt >&2
    echo "frontend contract check failed: $message" >&2
    exit 1
  fi
}

check_present() {
  pattern="$1"
  message="$2"
  if ! grep -R -n -E "$pattern" src >/dev/null; then
    echo "frontend contract check failed: $message" >&2
    exit 1
  fi
}

check_file_present() {
  path="$1"
  if [ ! -f "$path" ]; then
    echo "frontend contract check failed: required file is missing: $path" >&2
    exit 1
  fi
}

check_file_contains() {
  path="$1"
  pattern="$2"
  message="$3"
  if ! grep -E "$pattern" "$path" >/dev/null; then
    echo "frontend contract check failed: $message" >&2
    exit 1
  fi
}

check_absent "/api/v[1]/kornix" "legacy KORNIX v1 endpoints must not be used by frontend src"
check_absent "/api/v1/(auth|me)" "auth/session/CSRF endpoints must use canonical /api/v2 routes"
check_absent "/api/admin/v1|/admin" "user frontend must not expose backend admin/research routes"
check_absent "VITE_KORNIX_API_VERSION" "KORNIX frontend runtime is v2-only and must not expose an API version switch"
check_absent "[Mm][Oo][Cc][Kk]|M[O]CK_|VITE_(AUTH_MODE|ENABLE_[Mm][Oo][Cc][Kk]_API|ALLOW_PRIVATE_[Mm][Oo][Cc][Kk]_RUNTIME)|Войти в д[e]мо" "frontend runtime must not contain synthetic/offline API or auth paths"
check_absent "water_balance" "frontend runtime metric groups must not use retired water_balance naming"
check_absent "'admin'|'service_admin'" "user frontend must not model backend admin roles"
check_absent "calculateWaterRegime" "legacy synchronous calculate flow must not be imported"
check_absent "latestCalculationRunId" "displayed run must come from currentAppliedCalculationRunId"
check_absent "irrigation_tasks|irrigationTaskMm" "approval payload must use irrigationLayer/irrigationMm"
check_absent "useApprovedIrrigationSignature|approvedSignature" "approved irrigation state must not use localStorage as source of truth"
check_absent "localStorage\\.setItem\\([^)]*(token|jwt|session|access|refresh)|sessionStorage\\.setItem\\([^)]*(token|jwt|session|access|refresh)" "frontend must not store auth tokens in browser storage"
check_absent "2026-06-07|expected.*68|68 points" "production code must not hardcode forecast end or point count"
check_present "/api/v2/kornix" "KORNIX calculation API must target /api/v2/kornix"
check_present "irrigation-layer/current" "frontend must fetch backend active irrigation layer"
check_present "currentAppliedCalculationRunId" "workspace must use currentAppliedCalculationRunId"
check_present "managedScope" "approval submit must return backend-issued managedScope"
check_present "methodCode" "map/profile calls must carry methodCode"
check_present "/api/v2/auth/login" "login form must target backend session login endpoint"
check_present "CSRF_TOKEN_INVALID" "unsafe requests must handle CSRF token refresh policy"

check_file_contains ".env.production.example" "^VITE_API_BASE_URL=/api$" "production env example must use same-origin /api"
check_file_contains ".env.example" "^VITE_API_BASE_URL=/api$" "default env example must use same-origin /api"
check_file_contains ".env.integration.example" "^VITE_API_BASE_URL=/api$" "integration env example must use same-origin /api"
check_file_contains ".env.local.example" "^VITE_API_BASE_URL=/api$" "local env example must use same-origin /api"
check_file_contains ".env.integration.example" "^KORNIX_DEV_API_PROXY_TARGET=http://host\\.docker\\.internal:8001$" "integration env example must target host backend from Docker"
check_file_contains ".env.local.example" "^KORNIX_DEV_API_PROXY_TARGET=http://host\\.docker\\.internal:8001$" "local env example must target host backend from Docker"
check_file_contains "docker-compose.dev.yml" 'VITE_API_BASE_URL: \$\{VITE_API_BASE_URL:-/api\}' "dev compose browser API base must be /api"
check_file_contains "vite.config.ts" "loadEnv\\(mode, process\\.cwd\\(\\), ''\\)" "dev proxy target must be loadable from env files"
check_file_contains "vite.config.ts" "env\\.KORNIX_DEV_API_PROXY_TARGET \\|\\| 'http://localhost:8001'" "dev proxy target must not reuse VITE_API_BASE_URL"
if grep -R -n -E "VITE_(AUTH_MODE|ENABLE_[Mm][Oo][Cc][Kk]_API|ALLOW_PRIVATE_[Mm][Oo][Cc][Kk]_RUNTIME|KORNIX_API_VERSION)" \
  .env.example .env.local.example .env.integration.example .env.production.example .env.vds.example docker-compose.dev.yml >/tmp/kornix-contract-grep.txt; then
  cat /tmp/kornix-contract-grep.txt >&2
  echo "frontend contract check failed: retired env toggles must not be documented or wired into compose" >&2
  exit 1
fi
check_file_contains "docker-compose.yml" "KORNIX_API_BASE_URL: \\$\\{KORNIX_FRONTEND_API_BASE_URL:-/api\\}" "production compose default API base must be /api"
check_file_contains "nginx.conf" "Content-Security-Policy" "production nginx must set CSP"
check_file_contains "nginx.conf" "proxy_read_timeout 130s" "production nginx must keep long approval/recalculation API calls open"
if grep -E "localhost:8000|127\\.0\\.0\\.1:8000|localhost:8001|127\\.0\\.0\\.1:8001" nginx.conf >/dev/null; then
  echo "frontend contract check failed: production nginx CSP must not allow localhost API origins" >&2
  exit 1
fi

check_file_present "doc/security/KORNIX_FRONTEND_SECURITY_ARCHITECTURE.md"
check_file_present "doc/security/KORNIX_FRONTEND_AUTH_SESSION.md"
check_file_present "doc/security/KORNIX_FRONTEND_PRODUCTION_BUILD.md"
check_file_present "doc/security/KORNIX_FRONTEND_VDS_DEPLOYMENT.md"
check_file_present "doc/security/KORNIX_FRONTEND_SECURITY_TEST_PLAN.md"

rm -f /tmp/kornix-contract-grep.txt
