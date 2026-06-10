# Frontend ETo Single-Layer Soil FAO90 Metrics Report

## Status

KORNIX_FRONTEND_ETO_SINGLE_LAYER_SOIL_FAO90_METRICS_READY

## Backend observed

- Backend commit: `c8d20e740db9d7135538c8c8a7e832260e0323ce`
- Backend reachable through same-origin frontend proxy: yes
- Current applied calculation run: `bb_bootstrap_e85acda9b75745e09eb668da3b2e384c`
- Method profile: `potato_medium_fao90_single_layer_v1`
- Field map features: 37
- Profile metric count: 44

## Implementation

- Frontend metric registry covers the full 44-metric FAO90 single-layer soil chain for `simple_eto_single_layer_soil`.
- Profile chart data, selected-day summary, diagnostics rendering and CSV export consume dynamic backend metrics.
- Map tooltip and field CSV export include soil water, stress, precipitation, irrigation, drainage and crop-stage FAO90 fields.
- String/category and JSON diagnostic metrics are handled without numeric coercion.
- Existing authenticated live mode, same-origin proxy behavior and editable approval flow are preserved.

## Live smoke

- Authenticated session: PASS
- Same-origin API: PASS
- Map field count: 37
- Required FAO90 metrics present: PASS
- Profile metrics observed: 44
- Shortwave metric present: PASS
- Mock mode used: false
- Diagnostics JSON handled: PASS
- Editable approval regression: PASS

## Checks

- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm run test:contract`: PASS
- `bash scripts/frontend_stage1_security_scan.sh`: PASS
- Secret scan: PASS
- Docker dev build: PASS
- Docker prod build and live frontend smoke: PASS
- `git diff --check`: PASS

## Reports

- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_report.json`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_smoke.json`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_contract_map.json`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_test_log.txt`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_build_log.txt`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_secret_scan_log.txt`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_git_status.txt`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_changed_files.txt`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_diff_check_log.txt`
- `codex_reports/frontend_eto_single_layer_soil_fao90_metrics_smoke_log.txt`

## Blockers

- None.
