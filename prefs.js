// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _, ngettext} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createBackend} from './src/backend/backend.js';
import {cliIsAvailable} from './src/backend/ddcutilCli.js';
import {serviceIsAvailable} from './src/backend/ddcutilService.js';
import {logError} from './src/core/util.js';

const PROJECT_URL = 'https://github.com/Veldhost/veld-monitor-controls';
const ISSUES_URL = `${PROJECT_URL}/issues`;
const TROUBLESHOOTING_URL = `${PROJECT_URL}#troubleshooting`;
const WEBSITE_URL = 'https://veldhost.eu/open-source/veld-monitor-controls';

function addSwitch(group, settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
}

function addCombo(group, settings, key, title, subtitle, values) {
    const model = Gtk.StringList.new(values.map(value => value.label));
    const row = new Adw.ComboRow({title, subtitle, model});
    const current = values.findIndex(value => value.value === settings.get_string(key));
    row.selected = Math.max(0, current);
    row.connect('notify::selected', () => {
        const value = values[row.selected];
        if (value && value.value !== settings.get_string(key))
            settings.set_string(key, value.value);
    });
    group.add(row);
    return row;
}

function addSpin(group, settings, key, title, subtitle, lower, upper, step = 1) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: step,
            page_increment: step * 5,
        }),
        value: settings.get_int(key),
    });
    row.connect('notify::value', () => {
        const value = Math.round(row.value);
        if (value !== settings.get_int(key))
            settings.set_int(key, value);
    });
    group.add(row);
    return row;
}

function addStatusRow(group, title) {
    const status = new Gtk.Label({
        label: _('Checking…'),
        halign: Gtk.Align.END,
    });
    status.add_css_class('dim-label');
    const row = new Adw.ActionRow({
        title,
        subtitle: _('Checking…'),
    });
    row.add_suffix(status);
    group.add(row);
    return {row, status};
}

function setStatus(row, status, {ok, text, detail}) {
    status.label = text;
    status.remove_css_class('success');
    status.remove_css_class('error');
    status.add_css_class(ok ? 'success' : 'error');
    row.subtitle = detail;
}

function addLinkRow(group, title, subtitle, uri) {
    const row = new Adw.ActionRow({title, subtitle});
    row.activatable = true;
    row.add_suffix(new Gtk.Image({
        icon_name: 'external-link-symbolic',
        valign: Gtk.Align.CENTER,
    }));
    row.connect('activated', () => {
        try {
            Gio.AppInfo.launch_default_for_uri(uri, null);
        } catch (error) {
            logError(`could not open ${uri}`, error.message);
        }
    });
    group.add(row);
    return row;
}

function addShortcutRow(group, settings, key, title) {
    const row = new Adw.EntryRow({
        title,
        text: settings.get_strv(key)[0] ?? '',
    });
    row.connect('changed', () => {
        const text = row.text.trim();
        const next = text ? [text] : [];
        if (next.join(',') !== settings.get_strv(key).join(','))
            settings.set_strv(key, next);
    });
    group.add(row);
}

async function checkSetup(window) {
    const hasCli = cliIsAvailable();

    setStatus(window._ddcutilStatus.row, window._ddcutilStatus.status, {
        ok: hasCli,
        text: hasCli ? _('Available') : _('Not found'),
        detail: hasCli
            ? _('ddcutil was found in PATH.')
            : _('Install ddcutil so that it is available in PATH.'),
    });

    const hasService = await serviceIsAvailable(window._cancellable);
    if (window._cancellable.is_cancelled())
        return;

    setStatus(window._serviceStatus.row, window._serviceStatus.status, {
        ok: hasService,
        text: hasService ? _('Available') : _('Not found'),
        detail: hasService
            ? _('Used automatically when the backend is set to Automatic.')
            : _('Optional. The ddcutil CLI fallback will be used.'),
    });
}

async function loadDisplays(window, settings) {
    window._displayCancellable.cancel();
    const cancellable = new Gio.Cancellable();
    window._displayCancellable = cancellable;

    for (const row of window._displayRows)
        window._displayGroup.remove(row);
    window._displayRows = [];

    window._displayStatus.title = _('Checking displays…');
    window._displayStatus.subtitle = '';

    try {
        const backend = await createBackend(settings, cancellable);
        if (cancellable.is_cancelled()) {
            backend.destroy();
            return;
        }
        window._backend?.destroy();
        window._backend = backend;
        window._activeBackendRow.subtitle = backend.name;

        const displays = await backend.detect(cancellable);
        if (cancellable.is_cancelled())
            return;

        window._displayStatus.title = displays.length
            ? ngettext('%d display detected', '%d displays detected', displays.length)
                .format(displays.length)
            : _('No DDC displays detected');
        window._displayStatus.subtitle = backend.name;

        const hidden = new Set(settings.get_strv('hidden-displays'));
        const customNames = settings.get_value('custom-names').deepUnpack();

        for (const display of displays) {
            const key = display.key;
            const model = display.model || _('Display');
            const detail = display.connector
                ? `${model} · ${display.connector}`
                : model;
            const row = new Adw.ExpanderRow({
                title: GLib.markup_escape_text(customNames[key] || model, -1),
                subtitle: GLib.markup_escape_text(detail, -1),
            });

            const visibleRow = new Adw.SwitchRow({
                title: _('Show in Quick Settings'),
                active: !hidden.has(key),
            });
            visibleRow.connect('notify::active', () => {
                const next = new Set(settings.get_strv('hidden-displays'));
                if (visibleRow.active)
                    next.delete(key);
                else
                    next.add(key);
                settings.set_strv('hidden-displays', [...next]);
            });
            row.add_row(visibleRow);

            const nameRow = new Adw.EntryRow({
                title: _('Display name'),
                text: customNames[key] ?? '',
            });
            nameRow.connect('changed', () => {
                const names = settings.get_value('custom-names').deepUnpack();
                const value = nameRow.text.trim();
                if (value)
                    names[key] = value;
                else
                    delete names[key];
                settings.set_value('custom-names', new GLib.Variant('a{ss}', names));
            });
            row.add_row(nameRow);

            window._displayGroup.add(row);
            window._displayRows.push(row);
        }
    } catch (error) {
        if (cancellable.is_cancelled())
            return;
        window._activeBackendRow.subtitle = _('Unavailable');
        window._displayStatus.title = _('Could not detect displays');
        window._displayStatus.subtitle = error.message;
    }
}

export default class VeldMonitorControlsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._cancellable = new Gio.Cancellable();
        window._displayCancellable = new Gio.Cancellable();
        window._backend = null;
        window._displayRows = [];

        window.title = _('Veld Monitor Controls');
        window.search_enabled = true;

        const general = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(general);

        const placement = new Adw.PreferencesGroup({
            title: _('Quick Settings'),
            description: _('Where the brightness control appears in the system menu.'),
        });
        general.add(placement);

        addCombo(placement, settings, 'placement', _('Placement'),
            _('Next to GNOME’s volume slider, or where GNOME places extension items.'),
            [
                {value: 'above-volume', label: _('Above volume')},
                {value: 'below-volume', label: _('Below volume')},
                {value: 'gnome-default', label: _('GNOME default position')},
            ]);

        addCombo(placement, settings, 'update-mode', _('Update mode'),
            _('Live mode writes while dragging; on-release sends only the final value.'),
            [
                {value: 'live', label: _('Live, throttled')},
                {value: 'on-release', label: _('On release')},
            ]);

        addSpin(placement, settings, 'min-brightness-percent', _('Minimum brightness'),
            _('Lowest brightness the slider can set. Values below 1% are clamped unless zero brightness is allowed.'),
            0, 50);

        addSwitch(placement, settings, 'allow-zero-brightness', _('Allow zero brightness'),
            _('Only enable this if you can recover the monitor with its physical buttons.'));
        addSwitch(placement, settings, 'show-osd', _('Show on-screen display'),
            _('Show the brightness level on the affected monitor.'));
        addSwitch(placement, settings, 'debug-logging', _('Debug logging'),
            _('Write extra diagnostics to the system journal.'));

        const backends = new Adw.PreferencesGroup({
            title: _('Backend'),
            description: _('ddcutil-service is faster. The CLI fallback works without it.'),
        });
        general.add(backends);

        addCombo(backends, settings, 'backend', _('Backend'),
            _('Automatic uses ddcutil-service when available and falls back to ddcutil.'),
            [
                {value: 'auto', label: _('Automatic')},
                {value: 'service', label: _('ddcutil-service only')},
                {value: 'cli', label: _('ddcutil command only')},
            ]);

        const setup = new Adw.PreferencesGroup({
            title: _('Setup check'),
            description: _('Verify that ddcutil and the optional ddcutil-service are available to your user.'),
        });
        general.add(setup);

        window._ddcutilStatus = addStatusRow(setup, _('ddcutil'));
        window._serviceStatus = addStatusRow(setup, _('ddcutil-service'));

        window._activeBackendRow = new Adw.ActionRow({
            title: _('Active backend'),
            subtitle: _('Checking…'),
        });
        setup.add(window._activeBackendRow);

        const recheckRow = new Adw.ActionRow({
            title: _('Recheck setup'),
            subtitle: _('Run the checks again after installing packages or changing permissions.'),
        });
        const recheckButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            valign: Gtk.Align.CENTER,
        });
        recheckButton.add_css_class('flat');
        recheckButton.connect('clicked', () => {
            checkSetup(window);
            loadDisplays(window, settings);
        });
        recheckRow.add_suffix(recheckButton);
        setup.add(recheckRow);

        addLinkRow(setup, _('Setup and troubleshooting'),
            _('Open the project documentation in your browser.'),
            TROUBLESHOOTING_URL);

        checkSetup(window);

        const controls = new Adw.PreferencesPage({
            title: _('Controls'),
            icon_name: 'applications-system-symbolic',
        });
        window.add(controls);

        const visible = new Adw.PreferencesGroup({
            title: _('Visible controls'),
            description: _('Only controls supported by the monitor are shown.'),
        });
        controls.add(visible);

        addSwitch(visible, settings, 'show-contrast', _('Contrast'), null);
        addSwitch(visible, settings, 'show-volume', _('Monitor volume and mute'), null);
        addSwitch(visible, settings, 'show-input', _('Input source'), null);
        addSwitch(visible, settings, 'show-color', _('Color preset'), null);
        addSwitch(visible, settings, 'show-rgb', _('RGB gain'),
            _('Advanced: changes the monitor’s color balance.'));

        const writes = new Adw.PreferencesGroup({
            title: _('Writing to monitors'),
            description: _('DDC writes take time. Keeping the interval small feels smoother, but writes more often.'),
        });
        controls.add(writes);

        addSpin(writes, settings, 'write-interval-ms', _('Minimum write interval'),
            _('Milliseconds between writes to the same control.'), 0, 1000, 10);
        addSwitch(writes, settings, 'verify-writes', _('Verify every write'),
            _('Slower, but catches monitors that silently ignore a value.'));

        const shortcuts = new Adw.PreferencesPage({
            title: _('Shortcuts'),
            icon_name: 'preferences-desktop-keyboard-symbolic',
        });
        window.add(shortcuts);

        const shortcutGroup = new Adw.PreferencesGroup({
            title: _('Brightness shortcuts'),
            description: _('Use an accelerator such as &lt;Control&gt;XF86MonBrightnessUp.'),
        });
        shortcuts.add(shortcutGroup);

        addShortcutRow(shortcutGroup, settings, 'brightness-up', _('Increase brightness'));
        addShortcutRow(shortcutGroup, settings, 'brightness-down', _('Decrease brightness'));
        addSpin(shortcutGroup, settings, 'shortcut-step-percent', _('Step'),
            _('Percentage change per shortcut press.'), 1, 50);

        const displays = new Adw.PreferencesPage({
            title: _('Displays'),
            icon_name: 'video-display-symbolic',
        });
        window.add(displays);

        window._displayGroup = new Adw.PreferencesGroup({
            title: _('Detected displays'),
            description: _('Hide a monitor or give it a friendly name.'),
        });
        displays.add(window._displayGroup);

        window._displayStatus = new Adw.ActionRow({
            title: _('Checking displays…'),
            subtitle: '',
        });
        window._displayGroup.add(window._displayStatus);

        const refreshRow = new Adw.ActionRow({
            title: _('Refresh'),
            subtitle: _('Ask ddcutil for the connected monitors.'),
        });
        const refreshButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            valign: Gtk.Align.CENTER,
        });
        refreshButton.add_css_class('flat');
        refreshButton.connect('clicked', () => loadDisplays(window, settings));
        refreshRow.add_suffix(refreshButton);
        window._displayGroup.add(refreshRow);

        loadDisplays(window, settings);

        const about = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(about);

        const aboutGroup = new Adw.PreferencesGroup({
            description: _('A Veldhost open-source project.'),
        });
        about.add(aboutGroup);

        aboutGroup.add(new Adw.ActionRow({
            title: _('Veld Monitor Controls'),
            subtitle: this.metadata['version-name'],
        }));

        aboutGroup.add(new Adw.ActionRow({
            title: _('Backend'),
            subtitle: _('ddcutil-service preferred, ddcutil CLI fallback'),
        }));

        aboutGroup.add(new Adw.ActionRow({
            title: _('Privacy'),
            subtitle: _('No telemetry. Display communication stays on this computer.'),
        }));

        aboutGroup.add(new Adw.ActionRow({
            title: _('License'),
            subtitle: _('GPL-2.0-or-later'),
        }));

        addLinkRow(aboutGroup, _('Project website'),
            _('Screenshots, setup and release notes.'), WEBSITE_URL);
        addLinkRow(aboutGroup, _('Source code'),
            _('github.com/Veldhost/veld-monitor-controls'), PROJECT_URL);
        addLinkRow(aboutGroup, _('Report an issue'),
            _('Report bugs and request features.'), ISSUES_URL);

        window.connect('close-request', () => {
            window._cancellable.cancel();
            window._displayCancellable.cancel();
            window._backend?.destroy();
            window._backend = null;
            return false;
        });
    }
}
