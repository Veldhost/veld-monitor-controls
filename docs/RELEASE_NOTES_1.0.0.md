# Veld Monitor Controls 1.0.0

First public release. Real DDC/CI brightness and display controls for external
monitors, built into GNOME Quick Settings.

## Highlights

- Master brightness slider above GNOME volume
- Per-monitor brightness, contrast, monitor volume/mute, input source, color preset and optional RGB gain
- OSD feedback and configurable keyboard shortcuts
- Friendly display names and per-monitor visibility
- Fast `ddcutil-service` backend with automatic `ddcutil` CLI fallback
- Clear **Display options** section for global actions
- Setup checks and troubleshooting links in preferences
- Local only: no telemetry, no network access

## Requirements

- GNOME Shell 49, 50 or 51
- `ddcutil` and access to `/dev/i2c-*` for your user
- A DDC/CI-capable external monitor
- Optional: `ddcutil-service` for faster control

The GNOME Extensions listing is in preparation. Until then, install the zip from
this release:

```sh
gnome-extensions install --force veld-monitor-controls@veldhost.eu.shell-extension.zip
```

Log out and back in, then enable it (or switch it on in the Extensions app):

```sh
gnome-extensions enable veld-monitor-controls@veldhost.eu
```

GNOME Shell only discovers newly installed extensions when it starts, so
`gnome-extensions enable` reports that the extension "does not exist" until you
have logged out and back in.

Source: https://github.com/Veldhost/veld-monitor-controls
