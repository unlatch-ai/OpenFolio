#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$ROOT_DIR/native/AskForPermission/Sources"
APP_DIR="$ROOT_DIR/bin/OpenFolio Setup.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

rm -rf "$APP_DIR"
rm -rf "$ROOT_DIR/bin/OpenFolioPermissionGuide.app"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
cp "$ROOT_DIR/native/permission-guide/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "$ROOT_DIR/build/icon.icns" "$RESOURCES_DIR/icon.icns"

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
  -o "$MACOS_DIR/OpenFolioSetup"

chmod +x "$MACOS_DIR/OpenFolioSetup"
