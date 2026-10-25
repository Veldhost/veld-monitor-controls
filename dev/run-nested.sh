#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Run a windowed GNOME Shell development session with this extension installed
# in an isolated XDG profile.  GNOME 49+ uses mutter-devkit; install it with:
#   sudo pacman -S mutter-devkit
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$ROOT/.dev"
UUID="veld-monitor-controls@veldhost.eu"
EXT_DIR="$DEV_DIR/data/gnome-shell/extensions/$UUID"

if ! command -v mutter-devkit >/dev/null 2>&1 && [ ! -x /usr/lib/mutter-devkit ]; then
    echo "mutter-devkit is not installed; it is required for a windowed dev shell." >&2
    echo "Install it with: sudo pacman -S mutter-devkit" >&2
    exit 1
fi

mkdir -p "$EXT_DIR" "$DEV_DIR/config" "$DEV_DIR/cache" "$DEV_DIR/data"
rsync -a --delete --exclude 'gschemas.compiled*' \
    "$ROOT/extension.js" "$ROOT/prefs.js" "$ROOT/metadata.json" \
    "$ROOT/src" "$ROOT/schemas" "$ROOT/README.md" "$ROOT/LICENSE" \
    "$EXT_DIR/"
glib-compile-schemas "$EXT_DIR/schemas"
if [ "${VMC_MOCK:-0}" != 0 ]; then
    cp "$ROOT/dev/mock-backend.js" "$EXT_DIR/src/backend/backend.js"
fi

export XDG_DATA_HOME="$DEV_DIR/data"
export XDG_CONFIG_HOME="$DEV_DIR/config"
export XDG_CACHE_HOME="$DEV_DIR/cache"
export GSETTINGS_BACKEND=keyfile

gsettings --schemadir "$EXT_DIR/schemas" set org.gnome.shell enabled-extensions \
    "[\"$UUID\"]" >/dev/null
gsettings --schemadir "$EXT_DIR/schemas" set \
    org.gnome.shell.extensions.veld-monitor-controls debug-logging true >/dev/null

echo "Starting GNOME Shell development kit (VMC_MOCK=${VMC_MOCK:-0})"
exec dbus-run-session -- gnome-shell --devkit --wayland
