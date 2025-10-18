#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) deps check (мягко)
command -v squashfs >/dev/null || sudo apt-get update && sudo apt-get install -y libfuse2 squashfs-tools rpm fakeroot dpkg desktop-file-utils

# 2) install & build
corepack enable || true
pnpm i --frozen-lockfile
pnpm __build-linux
