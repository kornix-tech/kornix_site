#!/usr/bin/env sh
set -eu

port="${1:-18081}"
base_url="http://127.0.0.1:${port}"
headers_file="$(mktemp)"
body_file="$(mktemp)"

cleanup() {
  rm -f "$headers_file" "$body_file"
}
trap cleanup EXIT

wait_for_nginx() {
  attempt=1
  while [ "$attempt" -le 40 ]; do
    if curl -fsS --max-time 2 "${base_url}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.25
  done

  echo "nginx smoke failed: ${base_url}/healthz did not become ready" >&2
  return 1
}

request_expect_status() {
  route="$1"
  expected_status="$2"
  status="$(curl -sS -D "$headers_file" -o "$body_file" -w "%{http_code}" "${base_url}${route}")"
  cat "$headers_file"
  if [ "$status" != "$expected_status" ]; then
    echo "nginx smoke failed: ${route} returned ${status}, expected ${expected_status}" >&2
    cat "$body_file" >&2
    exit 1
  fi
}

request_frontend_route() {
  route="$1"
  request_expect_status "$route" "200"
  if ! grep -i "^Content-Security-Policy:" "$headers_file" >/dev/null; then
    echo "nginx smoke failed: ${route} response has no Content-Security-Policy header" >&2
    exit 1
  fi
}

wait_for_nginx

for route in / /login /fields/sp/2026 /water-regime/sp/2026 /irrigation-input/sp/2026; do
  echo "== GET ${route} =="
  request_frontend_route "$route"
  echo
done

echo "== GET /healthz =="
request_expect_status "/healthz" "200"
echo

echo "== GET /assets/__missing__.js =="
request_expect_status "/assets/__missing__.js" "404"
