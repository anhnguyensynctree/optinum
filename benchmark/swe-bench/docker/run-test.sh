#!/usr/bin/env bash
# Entrypoint: clone repo, run test at bug commit (expect FAIL), apply fix, run again (expect PASS)
set -euo pipefail

REPO_DIR="/workspace/repo"
TEST_FILE="/workspace/test_optinum.py"

# Write test code from env var
printf '%s' "$TEST_CODE" > "$TEST_FILE"

# Clone and checkout bug commit
git clone --quiet "$REPO_URL" "$REPO_DIR"
cd "$REPO_DIR"
git checkout --quiet "$BUG_COMMIT"

# Best-effort install — some repos need extras, failures are acceptable
pip install -e . -q 2>/dev/null || true

# Phase 1: run test at bug commit — expect non-zero (test should FAIL)
bug_result=0
pytest "$TEST_FILE" -x -q 2>&1 || bug_result=$?

# Phase 2: apply fix
if [ -n "${PATCH_FILE:-}" ] && [ -f "$PATCH_FILE" ]; then
  git apply < "$PATCH_FILE" 2>/dev/null || git checkout --quiet "$FIX_COMMIT"
else
  git checkout --quiet "$FIX_COMMIT"
fi

# Re-install in case the fix changed setup.py / pyproject.toml
pip install -e . -q 2>/dev/null || true

# Phase 3: run test at fix commit — expect zero (test should PASS)
fix_result=0
pytest "$TEST_FILE" -x -q 2>&1 || fix_result=$?

# Emit structured result — consumed by sandbox.ts
python3 -c "
import json, sys
print(json.dumps({
    'test_fails_on_bug': $bug_result != 0,
    'test_passes_on_fix': $fix_result == 0,
}))
"
