#!/usr/bin/env bash
# Browser end-to-end checks against a running dev server (npm run dev -> http://127.0.0.1:5173).
# Needs Python + Playwright:  pip install playwright && playwright install firefox
set -u
cd "$(dirname "$0")"
OUT=${OUT:-$(mktemp -d)}
PY=${PYTHON:-python3}
fail=0
for t in smoke feat stance shield reload pistol moves city hang; do
  if [ "$t" = smoke ]; then r=$($PY smoke.py http://127.0.0.1:5173/ "$OUT" 2>&1); else r=$($PY $t.py "$OUT" 2>&1); fi
  p=$(echo "$r" | grep -c '^PASS'); f=$(echo "$r" | grep -c '^FAIL')
  echo "$t: $p pass, $f fail"; echo "$r" | grep -E '^FAIL|Traceback'
  [ "$f" -gt 0 ] && fail=1
done
echo "screenshots: $OUT"; exit $fail
