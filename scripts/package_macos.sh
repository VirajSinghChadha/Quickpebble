#!/bin/bash
# Builds the Quick Pebble macOS .app and .dmg. Run on macOS with Rust and Node installed.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building Quick Pebble macOS application bundle..."
npm ci
npx tauri build --bundles dmg
echo "Quick Pebble DMG successfully generated in src-tauri/target/release/bundle/dmg/"
