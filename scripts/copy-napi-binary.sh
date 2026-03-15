#!/usr/bin/env bash
# Copies the locally built Rust binary to where the JS loader expects it.
# Run this after: cargo build --release -p alab-napi

set -e

PLATFORM=$(node -e "process.stdout.write(process.platform)")
ARCH=$(node -e "process.stdout.write(process.arch)")
TARGET_DIR="crates/alab-napi"

case "$PLATFORM-$ARCH" in
  darwin-arm64)
    SRC="target/release/libalab_napi.dylib"
    DEST="$TARGET_DIR/alab-napi.darwin-arm64.node"
    ;;
  darwin-x64)
    SRC="target/release/libalab_napi.dylib"
    DEST="$TARGET_DIR/alab-napi.darwin-x64.node"
    ;;
  linux-x64)
    SRC="target/release/libalab_napi.so"
    DEST="$TARGET_DIR/alab-napi.linux-x64-gnu.node"
    ;;
  linux-arm64)
    SRC="target/release/libalab_napi.so"
    DEST="$TARGET_DIR/alab-napi.linux-arm64-gnu.node"
    ;;
  win32-x64)
    SRC="target/release/alab_napi.dll"
    DEST="$TARGET_DIR/alab-napi.win32-x64-msvc.node"
    ;;
  *)
    echo "Unsupported platform: $PLATFORM-$ARCH"
    exit 1
    ;;
esac

if [ ! -f "$SRC" ]; then
  echo "Binary not found at $SRC"
  echo "Run: cargo build --release -p alab-napi"
  exit 1
fi

cp "$SRC" "$DEST"
echo "Copied $SRC → $DEST"
