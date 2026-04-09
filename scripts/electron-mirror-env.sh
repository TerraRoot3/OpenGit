#!/usr/bin/env bash

# Shared Electron download mirrors for environments where GitHub access is slow
# or blocked. Allow callers to override these values explicitly.

if [[ -z "${ELECTRON_MIRROR:-}" ]]; then
  export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
fi

if [[ -z "${ELECTRON_BUILDER_BINARIES_MIRROR:-}" ]]; then
  export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
fi

