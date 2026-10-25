#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Validate an extension bundle before it is uploaded to extensions.gnome.org.
set -euo pipefail

ZIP="${1:-}"
EXPECTED_UUID="veld-monitor-controls@veldhost.eu"
EXPECTED_NAME="Veld Monitor Controls"
EXPECTED_URL="https://github.com/Veldhost/veld-monitor-controls"

if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
    echo "Usage: $0 <extension.zip>" >&2
    exit 2
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "release check failed: $*" >&2
    exit 1
}

unzip -q "$ZIP" -d "$TMP_DIR"

metadata="$TMP_DIR/metadata.json"
[ -f "$metadata" ] || fail "metadata.json is missing"

jq -e . "$metadata" >/dev/null || fail "metadata.json is not valid JSON"

[ "$(jq -r '.uuid // empty' "$metadata")" = "$EXPECTED_UUID" ] ||
    fail "unexpected UUID"
[ "$(jq -r '.name // empty' "$metadata")" = "$EXPECTED_NAME" ] ||
    fail "unexpected extension name"
[ "$(jq -r '.url // empty' "$metadata")" = "$EXPECTED_URL" ] ||
    fail "unexpected project URL"
jq -e '.version == null' "$metadata" >/dev/null ||
    fail "metadata.json must not set the website-managed version field"
jq -e '."shell-version" == ["49", "50", "51"]' "$metadata" >/dev/null ||
    fail "unexpected shell-version list"
jq -e '."version-name" | test("^[A-Za-z0-9 .]{1,16}$")' "$metadata" >/dev/null ||
    fail "invalid version-name"
jq -e '.description | type == "string" and length > 40' "$metadata" >/dev/null ||
    fail "missing or too short description"

for file in \
    extension.js \
    prefs.js \
    LICENSE \
    src/backend/backend.js \
    src/core/manager.js \
    src/shell/quickSettingsView.js \
    schemas/org.gnome.shell.extensions.veld-monitor-controls.gschema.xml; do
    [ -f "$TMP_DIR/$file" ] || fail "required file is missing: $file"
done

xmllint --noout "$TMP_DIR/schemas/org.gnome.shell.extensions.veld-monitor-controls.gschema.xml" ||
    fail "invalid GSettings schema XML"

mapfile -t files < <(cd "$TMP_DIR" && find . -type f -printf '%P\n' | sort)

for file in "${files[@]}"; do
    case "$file" in
    gschemas.compiled | */gschemas.compiled)
        fail "compiled GSettings schema must not be shipped"
        ;;
    README* | CHANGELOG* | CONTRIBUTING* | SECURITY* | docs/* | assets/* | screenshots/* | tests/* | dev/*)
        fail "non-runtime file must not be shipped: $file"
        ;;
    *.zip | *.po | *.pot | *.mo)
        fail "build or translation artifact must not be shipped: $file"
        ;;
    esac

    if [ "$file" = ".." ] || [[ "$file" == ../* ]] || [[ "$file" == /* ]]; then
        fail "unsafe path in archive: $file"
    fi
done

echo "release check passed: ${#files[@]} files, $EXPECTED_UUID"
