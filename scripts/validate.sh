#!/usr/bin/env sh
set -eu
npm ci
npm run typecheck
npm run build
./scripts/check-frontend-contract.sh
