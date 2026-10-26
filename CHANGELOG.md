# Changelog

## 1.0.3 — 2026-10-26

- Fix an error at login when Quick Settings is not ready yet: the slider now
  waits for GNOME's volume slider before placing itself next to it
- New placement option: GNOME default position, using GNOME's own API for
  extension items
- Brightness shortcuts are added on enable and removed on disable
- Free the warning list in `disable()`; warnings can show again after unlocking
- The preferences window cancels its detection with a `Gio.Cancellable`; the CLI
  backend stops through the caller's cancellable
- Remove unused code and a duplicated display-key helper; fix lint findings

## 1.0.2 — 2026-10-25

- Run `ddcutil` from PATH with the arguments written out at each call; the
  "ddcutil path" and "Extra ddcutil arguments" settings were removed
- Remove an unneeded check before removing keybindings

## 1.0.1 — 2026-10-25

- Stop pending work through the existing cancellables instead of separate destroyed flags
- Remove optional checks and error wrappers for values that are always present
- Create backends through one helper; log the service-to-CLI fallback as debug output

## 1.0.0 — 2026-10-25

First public release.

- Native Quick Settings integration with a master brightness slider above or
  below GNOME volume
- Per-monitor brightness, contrast, volume, mute, input, color and RGB controls
- OSD feedback and configurable brightness shortcuts
- Friendly display names and per-monitor visibility
- Fast `ddcutil-service` backend with automatic CLI fallback
- Separate **Display options** section for global actions
- Setup checks and troubleshooting links in preferences
- Supports GNOME Shell 49, 50 and 51
