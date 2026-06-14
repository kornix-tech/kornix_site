#!/usr/bin/env sh
set -eu

port="${1:-18081}"
base_url="http://127.0.0.1:${port}"

for route in / /login /fields/sp/2026 /water-regime/sp/2026 /irrigation-input/sp/2026 /healthz; do
  echo "== GET ${route} =="
  curl -i "${base_url}${route}"
  echo
done

echo "== GET /assets/__missing__.js =="
curl -i "${base_url}/assets/__missing__.js"
