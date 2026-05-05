#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/bin/OpenFolio Contacts.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"
cp "$ROOT_DIR/native/contacts-bridge.Info.plist" "$CONTENTS_DIR/Info.plist"

swiftc \
  "$ROOT_DIR/native/contacts-bridge.swift" \
  -framework Contacts \
  -o "$MACOS_DIR/OpenFolioContacts"

chmod +x "$MACOS_DIR/OpenFolioContacts"
codesign --force --deep --sign - "$APP_DIR" >/dev/null
