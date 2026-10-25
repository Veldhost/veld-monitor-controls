# Launch kit

This file contains the copy and assets needed for the first public release.
It is intentionally kept out of the extension zip.

## Identity

| Field | Value |
|---|---|
| Extension name | Veld Monitor Controls |
| UUID | `veld-monitor-controls@veldhost.eu` |
| Publisher | veldhost (EGO account, opensource@veldhost.eu) |
| Source / issues | https://github.com/Veldhost/veld-monitor-controls |
| Project page | https://veldhost.eu/open-source/veld-monitor-controls |
| License | GPL-2.0-or-later |
| Version name | 1.0.0 |
| Shell versions | 49, 50, 51 |
| GitHub release | https://github.com/Veldhost/veld-monitor-controls/releases/tag/v1.0.0 |
| Upload file | `dist/veld-monitor-controls@veldhost.eu.shell-extension.zip` |

## GNOME Extensions listing

**Short description**

> Every external monitor, right in Quick Settings.

**Description**

> Real DDC/CI brightness, contrast, input, color and audio controls for external monitors, built into GNOME Quick Settings.
>
> * Master brightness slider above volume
> * Per-monitor brightness with live percentages
> * Contrast, monitor volume and mute, input source, color preset and optional RGB gain
> * OSD feedback and configurable keyboard shortcuts
> * Friendly display names and per-monitor visibility
> * Fast ddcutil-service backend with automatic ddcutil CLI fallback
> * Local only — no telemetry, no network access
>
> Requires a DDC/CI-capable monitor and ddcutil. For the smoothest experience, install ddcutil-service where available. See the project page for setup instructions.

**Links**

- Homepage: `https://github.com/Veldhost/veld-monitor-controls`
- Issue tracker: `https://github.com/Veldhost/veld-monitor-controls/issues`

## Icon

Upload `assets/icon-512.png` as the extension icon. Keep `assets/icon.svg` as the
source artwork and `assets/icon-128.png` for the website favicon.

## Screenshots

Upload these in order, with the suggested captions:

| File | Caption |
|---|---|
| `docs/screenshots/01-quick-settings.png` | Master brightness for external monitors, right above volume. |
| `docs/screenshots/02-monitor-menu.png` | Per-monitor brightness and controls, with global actions in their own section. |
| `docs/screenshots/03-more-controls.png` | Contrast, monitor volume and mute are one click away. |
| `docs/screenshots/04-input-source.png` | Switch monitor inputs without reaching for the OSD. |
| `docs/screenshots/05-preferences-displays.png` | Name, hide and refresh your monitors. |

The screenshots were captured on GNOME 51 with the default dark theme and
wallpaper. Display names are intentionally generic.

## Submission checklist

- [ ] `make release` passes and produces `dist/veld-monitor-controls@veldhost.eu.shell-extension.zip`
- [ ] The zip contains only runtime files, schema XML and `LICENSE`
- [ ] Metadata has no integer `version` field
- [ ] Metadata URL points to the public repository
- [ ] GNOME 49, 50 and 51 smoke tests are complete
- [ ] Icon and screenshots are uploaded to the EGO listing
- [ ] Homepage and issue links are correct
- [ ] README install instructions are accurate
- [x] The project page is live at https://veldhost.eu/open-source/veld-monitor-controls
  (it lives in the veldhost.eu site, not in this repository)
- [ ] The repository social preview is set to `assets/og-image.png`

## After EGO approval

Replace the placeholder install links:

1. In `README.md`, replace the “GNOME Extensions listing: coming soon” note with
   the real `https://extensions.gnome.org/extension/<id>/veld-monitor-controls/`
   link.
2. On the project page (https://veldhost.eu/open-source/veld-monitor-controls), point the primary
   “Download” button at the EGO listing instead of the GitHub release. The page
   is part of the veldhost.eu site, so the change goes through that site's repository.
3. Add the listing to the GitHub repository description and website footer.

## Announcement draft

> **Veld Monitor Controls 1.0 is out**
>
> Native brightness and display controls for external monitors, directly in GNOME
> Quick Settings. Per-monitor brightness, contrast, volume/mute, input, color and
> optional RGB gain, with a fast ddcutil-service backend and ddcutil CLI fallback.
>
> Requires a DDC/CI-capable monitor and ddcutil. Open source, local-only, and
> available for GNOME 49–51.
>
> Install: <EGO link>
> Source: https://github.com/Veldhost/veld-monitor-controls

## Suggested announcement channels

- GNOME Discourse, `extensions` tag
- r/gnome
- Fedora and Ubuntu community forums
- Your own Mastodon/social accounts
- A post on the Veldhost project page

Keep the announcement factual and include the setup requirement. Do not claim
support for GNOME versions that were not tested.
