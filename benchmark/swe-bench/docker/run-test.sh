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

# --- Install package ---
# Strategy A (preferred): editable install from source — pure Python packages only
# Strategy B (fallback): install binary wheel + surgical source overlay
install_ok=false

if pip install -e . -q 2>/dev/null; then
  install_ok=true
  install_mode="editable"
fi

if [ "$install_ok" = false ]; then
  # Fallback: binary wheel with optional version pin
  PKG_NAME=$(basename "$REPO_URL" | sed 's/scikit-learn/scikit-learn/;s/requests/requests/;s/django/django/;s/sphinx/sphinx/;s/sympy/sympy/;s/matplotlib/matplotlib/')
  if [ -n "${PKG_VERSION:-}" ]; then
    pip install "${PKG_NAME}==${PKG_VERSION}" -q 2>/dev/null || pip install "$PKG_NAME" -q 2>/dev/null || true
  else
    pip install "$PKG_NAME" -q 2>/dev/null || true
  fi
  install_mode="binary"

  # Identify installed package directory for surgical overlay
  PKG_DIR=$(cd / && python3 -c "
import importlib, os
name = '${PKG_NAME}'.replace('-', '_').replace('scikit_learn', 'sklearn')
try:
    m = importlib.import_module(name)
    print(os.path.dirname(m.__file__))
except Exception:
    print('')
" 2>/dev/null || echo "")

  # Identify files changed by the patch (only copy those)
  if [ -n "${PATCH_FILE:-}" ] && [ -f "$PATCH_FILE" ]; then
    PATCH_FILES=$(grep "^+++ b/" "$PATCH_FILE" | sed 's|^+++ b/||')
  else
    PATCH_FILES=""
  fi

  copy_patch_files() {
    if [ -z "${PKG_DIR:-}" ] || [ -z "${PATCH_FILES:-}" ]; then return; fi
    echo "$PATCH_FILES" | while read -r rel; do
      src="$REPO_DIR/$rel"
      pkg_rel=$(echo "$rel" | sed 's|^[^/]*/||')  # strip first path component
      dest="$PKG_DIR/$pkg_rel"
      if [ -f "$src" ]; then
        mkdir -p "$(dirname "$dest")"
        cp "$src" "$dest"
      fi
    done
  }

  copy_patch_files
fi

# Phase 1: run test at bug commit — expect non-zero (test should FAIL)
bug_result=0
pytest "$TEST_FILE" -x -q 2>&1 || bug_result=$?

# Phase 2: apply fix
if [ -n "${PATCH_FILE:-}" ] && [ -f "$PATCH_FILE" ]; then
  git apply --whitespace=fix "$PATCH_FILE" 2>/dev/null || \
    patch -p1 < "$PATCH_FILE" 2>/dev/null || \
    git checkout --quiet "$FIX_COMMIT" 2>/dev/null || true
else
  git checkout --quiet "$FIX_COMMIT" 2>/dev/null || true
fi

# For binary installs: re-copy patched files into installed location
if [ "${install_mode:-}" = "binary" ]; then
  copy_patch_files
fi
# For editable installs: no extra step — git apply changed the repo files in-place

# Phase 3: run test against fixed code
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
