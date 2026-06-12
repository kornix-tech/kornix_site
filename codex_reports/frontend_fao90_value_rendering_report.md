# Frontend FAO90 Value Rendering Report

Status: KORNIX_FRONTEND_FAO90_VALUE_RENDERING_READY

## Backend observed
- API base: http://127.0.0.1:5174/api
- currentAppliedCalculationRunId: bb_bootstrap_f073cd7d9e3742929db55da5765a173e
- expected validated run: PASS
- methodCode: simple_eto_single_layer_soil
- profileCode: potato_medium_fao90_single_layer_v1
- map features: 37
- profile metrics: 44

## Value coverage
- mandatory metric set includes shortwave: true
- map mandatory nulls: 0
- single-field profile mandatory nulls: 0
- multi-field profile mandatory nulls: 0
- single-field shortwave nulls: 0
- multi-field shortwave nulls: 0
- zeros preserved as zeros: true
- negative days_after_sowing preserved: true

## Checks
- npmCiOrEquivalent: PASS: npm executable is unavailable in this WSL runtime; existing node_modules equivalents were run directly for typecheck/build/contract/coverage.
- typecheck: PASS
- build: PASS
- contractTest: PASS
- metricCoverage: PASS
- securityScan: PASS
- secretScan: PASS
- dockerBuild: PASS
- liveSmoke: PASS
- gitDiffCheck: PASS

## Git
- committed: true
- pushed: true
- commitSha: see final response

## Blockers
- none
