#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$ROOT_DIR/native/AskForPermission/Sources"
APP_DIR="$ROOT_DIR/bin/OpenFolioPermissionGuide.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"
cp "$ROOT_DIR/native/permission-guide/Info.plist" "$CONTENTS_DIR/Info.plist"

SOURCES=()
while IFS= read -r source_file; do
  SOURCES+=("$source_file")
done < <(find "$SOURCE_DIR" -name '*.swift' -print | sort)
SOURCES+=("$ROOT_DIR/native/permission-guide/main.swift")

swiftc \
  -parse-as-library \
  -O \
  -framework AppKit \
  -framework SwiftUI \
  -framework ApplicationServices \
  -framework CoreGraphics \
  -framework IOKit \
  "${SOURCES[@]}" \
  -o "$MACOS_DIR/OpenFolioPermissionGuide"

chmod +x "$MACOS_DIR/OpenFolioPermissionGuide"
