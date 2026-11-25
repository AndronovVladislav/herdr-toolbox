#!/bin/sh
# Install this checkout or a verified build of its Herdr desktop mod.
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
bundle=
uninstall=
die() { printf 'gitview: %s\n' "$*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case $1 in
    --app) ;;
    --uninstall) uninstall=1 ;;
    --bundle) [ "$#" -ge 2 ] && [ -n "$2" ] || die "--bundle needs a file"; bundle=$2; shift ;;
    -h|--help) echo 'Usage: ./install.sh [--app] [--bundle FILE] [--uninstall]'; exit 0 ;;
    *) die "unknown argument $1; see ./install.sh --help or TUI.md" ;;
  esac
  shift
done

if [ -z "$bundle" ]; then
  if [ -x "$root/bin/herdr-gitview" ]; then
    exec bash "$root/herdr-app/install.sh" --binary "$root/bin/herdr-gitview" ${uninstall:+--uninstall}
  fi
  exec bash "$root/herdr-app/install.sh" ${uninstall:+--uninstall}
fi

[ -f "$bundle" ] || die "no bundle at $bundle"
[ -f "$bundle.sha256" ] || die "no checksum at $bundle.sha256; nothing installed"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -- "$bundle" "$work/app.tar.gz"
if command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$work/app.tar.gz")
else
  actual=$(sha256sum "$work/app.tar.gz")
fi
expected=$(cut -d ' ' -f1 < "$bundle.sha256")
[ "${actual%% *}" = "$expected" ] || die "the bundle does not match its SHA-256; nothing installed"

tar -xzf "$work/app.tar.gz" -C "$work"
set -- "$work"/herdr-gitview-app-*/
[ "$#" -eq 1 ] && [ -x "$1/bin/herdr-gitview" ] && [ -f "$1/LICENSE" ] || die "invalid Gitview bundle"
"$1/bin/herdr-gitview" json 2>/dev/null | grep -q '"error"' || die "the bundled binary does not run on this machine"
exec_install=${1%/}
bash "$exec_install/herdr-app/install.sh" --binary "$exec_install/bin/herdr-gitview" ${uninstall:+--uninstall}
