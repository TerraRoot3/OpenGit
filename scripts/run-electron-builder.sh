#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

source "scripts/electron-mirror-env.sh"

echo "🌐 Electron mirror: ${ELECTRON_MIRROR}"
echo "🌐 Electron Builder binaries mirror: ${ELECTRON_BUILDER_BINARIES_MIRROR}"

npx electron-builder "$@"
