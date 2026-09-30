#!/usr/bin/env bash
# Browser end-to-end checks against a running dev server (npm run dev -> http://127.0.0.1:5173).
# Needs Python + Playwright:  pip install playwright && playwright install firefox
set -u
cd "$(dirname "$0")"
OUT=${OUT:-$(mktemp -d)}
fail=0
for t in smoke feat stance shield reload pistol moves; do
  if [ "$t" = smoke ]; then r=$(python3 smoke.py http://127.0.0.1:5173/ "$OUT" 2>&1); else r=$(python3 $t.py "$OUT" 2>&1); fi
  p=$(echo "$r" | grep -c '^PASS'); f=$(echo "$r" | grep -c '^FAIL')
  echo "$t: $p pass, $f fail"; echo "$r" | grep -E '^FAIL|Traceback'
  [ "$f" -gt 0 ] && fail=1
done
echo "screenshots: $OUT"; exit $fail
