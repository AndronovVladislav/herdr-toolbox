#!/usr/bin/env bash
# Build this checkout for a locally linked Herdr TUI plugin.
set -euo pipefail

ROOT="${HERDR_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT/target}"
command -v cargo >/dev/null 2>&1 || { echo "herdr-gitview: install Rust to build this plugin" >&2; exit 1; }
cargo build --manifest-path "$ROOT/Cargo.toml" --target-dir "$TARGET_DIR" --release --locked
mkdir -p "$ROOT/bin"
install -m 0755 "$TARGET_DIR/release/herdr-gitview" "$ROOT/bin/herdr-gitview"
