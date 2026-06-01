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

check_absent "/api/v1/kornix" "legacy KORNIX v1 endpoints must not be used by frontend src"
check_absent "/api/admin/v1|/admin" "user frontend must not expose backend admin/research routes"
check_absent "calculateWaterRegime" "legacy synchronous calculate flow must not be imported"
check_absent "latestCalculationRunId" "displayed run must come from currentAppliedCalculationRunId"
check_absent "irrigation_tasks|irrigationTaskMm" "approval payload must use irrigationLayer/irrigationMm"
check_absent "useApprovedIrrigationSignature|approvedSignature" "approved irrigation state must not use localStorage as source of truth"
check_absent "2026-06-07|expected.*68|68 points" "production code must not hardcode forecast end or point count"
check_present "/api/v2/kornix" "KORNIX calculation API must target /api/v2/kornix"
check_present "irrigation-layer/current" "frontend must fetch backend active irrigation layer"
check_present "currentAppliedCalculationRunId" "workspace must use currentAppliedCalculationRunId"
check_present "managedScope" "approval submit must return backend-issued managedScope"
check_present "methodCode" "map/profile calls must carry methodCode"

rm -f /tmp/kornix-contract-grep.txt
