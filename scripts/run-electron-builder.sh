#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

source "scripts/electron-mirror-env.sh"

echo "🌐 Electron mirror: ${ELECTRON_MIRROR}"
echo "🌐 Electron Builder binaries mirror: ${ELECTRON_BUILDER_BINARIES_MIRROR}"

builder_log="$(mktemp -t opengit-electron-builder.XXXXXX)"
trap 'rm -f "$builder_log"' EXIT

set +e
npx electron-builder "$@" 2>&1 | tee "$builder_log"
builder_status=${PIPESTATUS[0]}
set -e

if [[ "$builder_status" -eq 0 ]]; then
  exit 0
fi

if ! grep -q 'unable to execute hdiutil.*args=\["detach".*\/Volumes\/OpenGit ' "$builder_log"; then
  exit "$builder_status"
fi

echo "⚠️  electron-builder 无法卸载临时 DMG 卷，清理后重试一次..."
while IFS= read -r mounted_volume; do
  [[ -n "$mounted_volume" ]] || continue
  if mount | grep -Fq " on ${mounted_volume} ("; then
    echo "🧹 强制卸载: ${mounted_volume}"
    hdiutil detach -force "$mounted_volume" 2>/dev/null \
      || diskutil unmount force "$mounted_volume" 2>/dev/null \
      || true
  fi
done < <(
  sed -nE 's/.*args=\["detach","-quiet","(\/Volumes\/OpenGit [^"]+)"\].*/\1/p' \
    "$builder_log" | sort -u
)

sleep "${OPENGIT_BUILDER_RETRY_DELAY_SECONDS:-2}"
echo "🔁 重新执行 electron-builder..."
npx electron-builder "$@"
