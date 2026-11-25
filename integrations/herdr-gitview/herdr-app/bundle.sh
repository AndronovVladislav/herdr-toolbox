#!/usr/bin/env bash
# Packs the CI artifact for one platform: what the Herdr app
# install needs, with a prebuilt binary, so no clone and no Rust toolchain.
#
#   herdr-app/bundle.sh <herdr-gitview binary> <target> <out dir>
#
# Writes <out dir>/herdr-gitview-app-<target>.tar.gz and its .sha256. Inside,
# a standalone folder with the binary, mods, installers and license.
set -euo pipefail
[ $# -eq 3 ] || { sed -n '5p' "$0" >&2; exit 2; }
binary=$1 target=$2 out=$3
repo=$(cd "$(dirname "$0")/.." && pwd)
name=herdr-gitview-app-$target
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
b=$work/$name
mkdir -p "$b/bin" "$b/herdr-app/mods"
install -m 0755 "$binary" "$b/bin/herdr-gitview"
cp "$repo/LICENSE" "$repo/TOOLBOX.md" "$repo/install.sh" "$b/"
cp "$repo/herdr-app/install.sh" "$repo/herdr-app/keys.json" "$repo/herdr-app/keys.linux.json" "$b/herdr-app/"
for m in "$repo"/herdr-app/mods/*/; do
  m=$(basename "$m")
  # -L: shared files are links in the repo. Not what `herdr-app check`
  # writes into a mod folder in a clone, nor hidden caches.
  (cd "$repo/herdr-app/mods" && find -L "$m" -type f ! -name gpui-kit.d.ts ! -name jsconfig.json ! -path '*/.*') |
    while read -r f; do mkdir -p "$b/herdr-app/mods/$(dirname "$f")" && cp -L "$repo/herdr-app/mods/$f" "$b/herdr-app/mods/$f"; done
done
mkdir -p "$out"
out=$(cd "$out" && pwd)
(cd "$work" && tar -czf "$out/$name.tar.gz" "$name")
(cd "$out"
 if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$name.tar.gz"
 else sha256sum "$name.tar.gz"; fi >"$name.tar.gz.sha256")
echo "$out/$name.tar.gz"
