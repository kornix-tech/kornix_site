#!/usr/bin/env sh
set -eu
npm ci
npm run typecheck
VITE_API_BASE_URL=/api VITE_KORNIX_CALCULATION_TIMEOUT_MS=120000 npm run build
npm run check:production-bundle
./scripts/check-frontend-contract.sh
