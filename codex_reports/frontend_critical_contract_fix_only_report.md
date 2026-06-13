# Frontend Critical Contract Fix Only Report

Status: NOT_READY

## Scope
Critical frontend contract fixes only. No backend, CSS, layout, FAO90 metric-code, mock-runtime, or cosmetic changes were made in this task. Pre-existing visual WIP (CHANGELOG.md, src/styles.css) was moved to git stash codex-pre-critical-contract-cosmetic-wip before this work to avoid mixing scopes.

## Fixed
- Smoke metric gates now default to the 44-metric FAO90 contract instead of legacy 13.
- Smoke scripts read REQUIRED_FAO90_METRIC_CODES from src/config/metrics.ts through scripts/lib/fao90MetricContract.mjs.
- WaterRegimeChart no longer fabricates actual_transpiration_mm = 0 or actual_soil_evaporation_mm = actual_evapotranspiration_mm when component metrics are absent/null.
- Added scripts/check-water-regime-critical-contract.mjs to guard the critical contract.

## Proof
- Required FAO90 metrics: 44/44.
- Smoke expected metrics default: 44.
- Full 44 required metrics checked in smoke: PASS.
- Known null-to-zero ET fallback patterns: absent.
- /api/v1/kornix runtime usage in src: absent.
- /api/admin/v1 runtime usage in src: absent.
- currentAppliedCalculationRunId flow: present.
- Multi-field aggregation=area_weighted_mean: present.

## Checks
- npm run typecheck: npm unavailable; bundled Node/tsc equivalent PASS.
- npm run build: FAIL in this environment because Windows Node requires missing Rollup optional dependency @rollup/rollup-win32-x64-msvc, while WSL has no node/npm and node_modules contains Linux Rollup optional packages.
- npm run test:contract: npm unavailable; equivalent contract command PASS.
- git diff --check: PASS.
- targeted grep checks: PASS.
- secret scan over git diff: PASS; only benign report key names matched, no secret values.
- live smoke: NOT_RUN_ENV_UNAVAILABLE; ephemeral backend user provisioning exited with null before authenticated flow.

## Blockers
- Build cannot be proven in this local mixed Windows-Node/Linux-node_modules environment.
- Authenticated live smoke cannot be proven because ephemeral backend user provisioning is unavailable from this environment.
