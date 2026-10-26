// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {DdcManager} from './src/core/manager.js';
import {clamp, logError} from './src/core/util.js';
import {showBrightnessOsd} from './src/shell/osd.js';
import {QuickSettingsView} from './src/shell/quickSettingsView.js';

const START_DELAY_MS = 600;
const MONITOR_SETTLE_MS = 500;
const BACKEND_KEYS = ['backend', 'sleep-multiplier'];

export default class VeldMonitorControlsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._notified = new Set();

        this._manager = new DdcManager(this._settings, {
            onWarning: message => this._notify(message),
        });
        this._addKeybindings();

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) =>
            this._onSettingChanged(key));
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            () => this._scheduleRefresh());

        if (Main.layoutManager._startingUp) {
            this._startupCompleteId = Main.layoutManager.connect('startup-complete',
                () => this._queueStart());
        } else {
            this._queueStart();
        }
    }

    disable() {
        if (this._startupCompleteId) {
            Main.layoutManager.disconnect(this._startupCompleteId);
            this._startupCompleteId = 0;
        }

        if (this._startTimer) {
            GLib.source_remove(this._startTimer);
            this._startTimer = 0;
        }

        if (this._refreshTimer) {
            GLib.source_remove(this._refreshTimer);
            this._refreshTimer = 0;
        }

        if (this._backendReloadTimer) {
            GLib.source_remove(this._backendReloadTimer);
            this._backendReloadTimer = 0;
        }

        this._removeKeybindings();

        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._settings.disconnect(this._settingsChangedId);

        this._view?.destroy();
        this._view = null;

        this._manager.destroy();
        this._manager = null;

        this._notified = null;
        this._settings = null;
    }

    _queueStart() {
        this._startTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, START_DELAY_MS, () => {
            this._startTimer = 0;
            this._view = new QuickSettingsView(this, this._manager, this._settings);
            this._manager.init().catch(error => logError('startup failed', error.message));
            return GLib.SOURCE_REMOVE;
        });
    }

    _scheduleRefresh() {
        if (this._refreshTimer)
            GLib.source_remove(this._refreshTimer);

        this._refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MONITOR_SETTLE_MS, () => {
            this._refreshTimer = 0;
            this._manager.refresh().catch(error => logError('refresh failed', error.message));
            return GLib.SOURCE_REMOVE;
        });
    }

    _onSettingChanged(key) {
        if (BACKEND_KEYS.includes(key)) {
            if (this._backendReloadTimer)
                GLib.source_remove(this._backendReloadTimer);

            this._backendReloadTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._backendReloadTimer = 0;
                this._manager.init().catch(error =>
                    logError('backend reload failed', error.message));
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        if (key === 'placement' && this._view) {
            this._view.destroy();
            this._view = new QuickSettingsView(this, this._manager, this._settings);
            this._view.sync();
            return;
        }

        this._manager.updateSettings();
        this._view?.refresh();
    }

    _addKeybindings() {
        // Mutter rebinds these by itself when the settings keys change.
        Main.wm.addKeybinding(
            'brightness-up',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._stepBrightness(1));

        Main.wm.addKeybinding(
            'brightness-down',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._stepBrightness(-1));
    }

    _removeKeybindings() {
        Main.wm.removeKeybinding('brightness-up');
        Main.wm.removeKeybinding('brightness-down');
    }

    _stepBrightness(direction) {
        if (!this._manager.hasBrightness)
            return;

        const current = this._manager.getMasterFraction() ?? 0.5;
        const step = this._settings.get_int('shortcut-step-percent') / 100;
        const next = clamp(current + direction * step, 0, 1);

        this._manager.applyMaster(next);

        if (this._settings.get_boolean('show-osd'))
            showBrightnessOsd(this._manager.displays, next);
    }

    _notify(message) {
        if (this._notified.has(message))
            return;

        this._notified.add(message);
        Main.notify(_('Veld Monitor Controls'), message);
    }
}
