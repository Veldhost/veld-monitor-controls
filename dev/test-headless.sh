#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Headless smoke test for GNOME 49+.  It starts a separate GNOME Shell in an
# isolated XDG profile, enables the extension, and reports its state and
# errors.  This is not a substitute for testing the real session, but it
# catches module-load and lifecycle errors very quickly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$ROOT/.dev"
UUID="veld-monitor-controls@veldhost.eu"
EXT_DIR="$DEV_DIR/data/gnome-shell/extensions/$UUID"
LOG="$DEV_DIR/shell.log"

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
gsettings --schemadir "$EXT_DIR/schemas" set \
    org.gnome.shell.extensions.veld-monitor-controls placement "${VMC_PLACEMENT:-above-volume}" >/dev/null

rm -f "$LOG"

dbus-run-session -- bash -c '
    set +e
    gnome-shell --headless --wayland --virtual-monitor 1920x1080 >"$0" 2>&1 &
    shellpid=$!
    sleep 13
    echo "=== extension info ==="
    gnome-extensions info "$1"
    echo "=== enable/disable cycles ==="
    for i in 1 2 3; do
        echo "cycle $i disable"
        gnome-extensions disable "$1"
        sleep 1
        echo "cycle $i enable"
        gnome-extensions enable "$1"
        sleep 2
    done
    echo "=== disable during startup delay, then during backend init ==="
    gnome-extensions disable "$1"
    sleep 1
    gnome-extensions enable "$1" && gnome-extensions disable "$1"
    sleep 1
    gnome-extensions enable "$1"
    sleep 0.3
    gnome-extensions disable "$1"
    sleep 1
    gnome-extensions enable "$1"
    sleep 0.65
    gnome-extensions disable "$1"
    sleep 2
    gnome-extensions enable "$1"
    sleep 3
    echo "=== settings changes ==="
    set_key() {
        echo "set $1 $2"
        gsettings --schemadir "$SCHEMA_DIR" set org.gnome.shell.extensions.veld-monitor-controls "$1" "$2"
        sleep 1.5
    }
    SCHEMA_DIR="$2"
    set_key placement below-volume
    set_key placement gnome-default
    set_key placement above-volume
    set_key hidden-displays "[\"x\"]"
    set_key show-rgb true
    set_key brightness-up "[\"<Super>F2\"]"
    set_key backend cli
    set_key backend auto
    echo "=== after cycles ==="
    gnome-extensions info "$1"
    echo "=== extension errors ==="
    gdbus call --session --dest org.gnome.Shell.Extensions \
        --object-path /org/gnome/Shell/Extensions \
        --method org.gnome.Shell.Extensions.GetExtensionErrors "$1"
    echo "=== relevant log ==="
    grep -E "veld-monitor-controls|JS ERROR|GNOME Shell-CRITICAL|Stack trace" "$0" || true
    kill "$shellpid" 2>/dev/null
    wait "$shellpid" 2>/dev/null
' "$LOG" "$UUID" "$EXT_DIR/schemas"

echo "=== full log: $LOG ==="
