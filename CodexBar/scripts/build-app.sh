#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODEXBAR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OPEN_GIT_ROOT="$(cd "$CODEXBAR_DIR/.." && pwd)"
OUTPUT_DIR="$CODEXBAR_DIR/dist"
APP_DIR="$OUTPUT_DIR/CodexBar.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
RUNTIME_ROOT="$RESOURCES_DIR/OpenGitRuntime"
ICON_SOURCE="$CODEXBAR_DIR/Assets/AppIcon-1024.png"
ICONSET_DIR="$OUTPUT_DIR/CodexBar.iconset"

cd "$CODEXBAR_DIR"
swift build -c release

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR/Runtime" "$RUNTIME_ROOT/electron/ipc"
cp ".build/release/CodexBar" "$MACOS_DIR/CodexBar"
cp "$CODEXBAR_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "$CODEXBAR_DIR/Runtime/host.js" "$RESOURCES_DIR/Runtime/host.js"
cp "$CODEXBAR_DIR/Runtime/package.json" "$RUNTIME_ROOT/package.json"

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"
sips -z 16 16 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
cp "$ICON_SOURCE" "$ICONSET_DIR/icon_512x512@2x.png"
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns"
rm -rf "$ICONSET_DIR"

for runtime_file in \
  ai-sessions.js \
  codex-feishu-attachments.js \
  codex-feishu-bridge.js \
  codex-main-session.js \
  codex-proactive-notifications.js \
  codex-project-session-router.js \
  codex-session-state-source.js
do
  cp "$OPEN_GIT_ROOT/electron/ipc/$runtime_file" "$RUNTIME_ROOT/electron/ipc/$runtime_file"
done

if [ -d "$OPEN_GIT_ROOT/node_modules/@larksuiteoapi/node-sdk" ]; then
  mkdir -p "$RUNTIME_ROOT/node_modules"
  cd "$RUNTIME_ROOT"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline
else
  cd "$RUNTIME_ROOT"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund
fi

rm -rf \
  "$RUNTIME_ROOT/node_modules/@larksuiteoapi/node-sdk/es" \
  "$RUNTIME_ROOT/node_modules/@larksuiteoapi/node-sdk/types"

chmod 755 "$MACOS_DIR/CodexBar" "$RESOURCES_DIR/Runtime/host.js"
codesign --force --deep --sign - "$APP_DIR"

echo "$APP_DIR"
