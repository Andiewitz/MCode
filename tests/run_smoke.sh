#!/usr/bin/env sh
# MCode smoke tests: workspace tests + basic client sanity checks.
set -e

cd "$(dirname "$0")/.."

echo "==> cargo test --workspace"
cargo test --workspace --quiet

echo "==> client: unit tests"
node --test client/test/*.test.js

echo "==> client: referenced assets exist"
test -f client/index.html
test -f client/src/main.js
test -f client/src/styles.css

echo "==> tauri.conf.json is valid JSON"
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json', 'utf8'))"

echo "All smoke tests passed."
