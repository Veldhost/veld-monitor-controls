#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Start a headless Shell, then ask the Shell to launch the extension
# preferences process.  Useful for catching prefs.js/GTK errors without
# logging out of the main session.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$ROOT/.dev"
UUID="veld-monitor-controls@veldhost.eu"
EXT_DIR="$DEV_DIR/data/gnome-shell/extensions/$UUID"
LOG="$DEV_DIR/prefs-shell.log"

mkdir -p "$EXT_DIR" "$DEV_DIR/config" "$DEV_DIR/cache" "$DEV_DIR/data"
rsync -a --delete --exclude 'gschemas.compiled*' \
    "$ROOT/extension.js" "$ROOT/prefs.js" "$ROOT/metadata.json" \
    "$ROOT/src" "$ROOT/schemas" "$ROOT/README.md" "$ROOT/LICENSE" \
    "$EXT_DIR/"
glib-compile-schemas "$EXT_DIR/schemas"
cp "$ROOT/dev/mock-backend.js" "$EXT_DIR/src/backend/backend.js"

export XDG_DATA_HOME="$DEV_DIR/data"
export XDG_CONFIG_HOME="$DEV_DIR/config"
export XDG_CACHE_HOME="$DEV_DIR/cache"
export GSETTINGS_BACKEND=keyfile

gsettings --schemadir "$EXT_DIR/schemas" set org.gnome.shell enabled-extensions \
    "[\"$UUID\"]" >/dev/null
gsettings --schemadir "$EXT_DIR/schemas" set \
    org.gnome.shell.extensions.veld-monitor-controls debug-logging true >/dev/null

rm -f "$LOG"

dbus-run-session -- bash -c '
    set +e
    gnome-shell --headless --wayland >"$0" 2>&1 &
    shellpid=$!
    sleep 8
    echo "=== launching prefs ==="
    WAYLAND_DISPLAY=wayland-1 gnome-extensions prefs "$1"
    sleep 5
    echo "=== log ==="
    grep -E "veld-monitor-controls|prefs|JS ERROR|CRITICAL|Stack trace|TypeError|ReferenceError|Adw|Gtk" "$0" | tail -80 || true
    kill "$shellpid" 2>/dev/null
    wait "$shellpid" 2>/dev/null
' "$LOG" "$UUID"
