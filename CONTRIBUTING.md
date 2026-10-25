# Contributing

Thanks for helping improve Veld Monitor Controls.

## Development setup

Requirements:

- GNOME Shell 49–51
- `gjs`
- `glib-compile-schemas`
- `node` for the JavaScript syntax check
- `ddcutil`, or the mock backend for UI work

Run the checks:

```sh
make check
```

Install into the current user's extension directory:

```sh
make install
```

Log out and back in once so GNOME Shell discovers the new extension, then:

```sh
gnome-extensions enable veld-monitor-controls@veldhost.eu
```

GNOME Shell caches loaded extension modules. Disabling and re-enabling an
extension does not load changed code; log out and back in after changing the
extension itself.

## Mock backend

Use the mock backend to work on the menu without touching monitors:

```sh
VMC_MOCK=1 ./dev/run-nested.sh
```

The mock exposes two displays with different capabilities and write latencies.

## Headless smoke tests

```sh
./dev/test-headless.sh
./dev/test-prefs.sh
```

These start an isolated GNOME Shell profile and check module loading, enable /
disable cycles and the preferences process.

## Code style

- Use four-space indentation and single quotes.
- Keep Shell-specific code in `src/shell/`.
- Keep DDC and parser logic independent of GNOME Shell so it stays testable.
- Avoid new private Shell APIs unless there is no public alternative; keep any
  such use isolated and documented.
- Do not add telemetry or network access.

## Release packaging

```sh
make release
```

The release target builds a clean zip and verifies that it contains only runtime
files, the schema XML and the license. Do not upload a package with compiled
GSettings schemas, tests, dev scripts or screenshots.

## Translations

The extension uses the `veld-monitor-controls` gettext domain. Translation
infrastructure is not set up yet; translation merge requests are welcome after
the first release.
