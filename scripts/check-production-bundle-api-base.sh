#!/usr/bin/env sh
set -eu

dist_dir="${1:-dist}"

if [ ! -d "$dist_dir" ]; then
  echo "ERROR: production bundle directory is missing: $dist_dir" >&2
  exit 1
fi

# Production/BFF-схема должна ходить через same-origin /api.
# Прямой localhost в bundle ломает cookie/session/CSRF и VDS routing.
if grep -R "localhost:8001\|127.0.0.1:8001" "$dist_dir" >/dev/null 2>&1; then
  echo "ERROR: production frontend bundle contains direct localhost API URL" >&2
  exit 1
fi

echo "production bundle API base check ok"
