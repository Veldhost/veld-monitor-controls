// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickSlider} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {permittedValues, valueName, VCP} from '../core/capabilities.js';
import {fmtPercent, logDebug} from '../core/util.js';
import {showBrightnessOsd} from './osd.js';

function radioItem(label, callback) {
    const item = new PopupMenu.PopupMenuItem(label);
    item.connect('activate', callback);
    return item;
}

export class QuickSettingsView {
    constructor(extension, manager, settings) {
        this._extension = extension;
        this._manager = manager;
        this._settings = settings;
        this._masterDragging = false;
        this._pendingMaster = null;
        this._refreshing = false;
        this._rows = new Map();
        this._signature = '';

        this._buildSlider();
        this._place();
        this._unsubscribe = manager.subscribe(() => this.sync());
    }

    _place() {
        const quickSettings = Main.panel.statusArea.quickSettings;
        // GNOME's volume slider; Quick Settings has no public getter for it.
        const volume = quickSettings._volumeOutput.quickSettingsItems.at(-1);
        const sibling = this._settings.get_string('placement') === 'below-volume'
            ? volume.get_next_sibling()
            : volume;
        quickSettings.menu.insertItemBefore(this._slider, sibling, 2);
    }

    _buildSlider() {
        this._slider = new QuickSlider({
            iconName: 'display-brightness-symbolic',
            iconLabel: _('Brightness'),
        });
        this._slider.visible = false;
        this._slider.menuEnabled = true;
        this._slider.menuButtonAccessibleName = _('Open display controls');
        this._slider.slider.accessible_name = _('Brightness');

        this._slider.menu.setHeader('display-brightness-symbolic', _('Displays'));

        this._section = new PopupMenu.PopupMenuSection();
        this._slider.menu.addMenuItem(this._section);

        this._footerSection = new PopupMenu.PopupMenuSection();
        /* Translators: Section heading for actions that apply to all displays. */
        this._footerSection.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem(_('Display options')));

        this._settingsItem = new PopupMenu.PopupImageMenuItem(
            _('Display Settings…'), 'preferences-system-symbolic');
        this._settingsItem.connect('activate', () => {
            this._slider.menu.close();
            this._extension.openPreferences();
        });
        this._footerSection.addMenuItem(this._settingsItem);

        this._refreshItem = new PopupMenu.PopupImageMenuItem(
            _('Refresh displays'), 'view-refresh-symbolic');
        this._refreshItem.connect('activate', () => this._refreshDisplays());
        this._footerSection.addMenuItem(this._refreshItem);

        this._slider.menu.addMenuItem(this._footerSection);

        this._masterChangedId = this._slider.slider.connect('notify::value', () => {
            if (this._settings.get_string('update-mode') === 'on-release' && this._masterDragging) {
                this._pendingMaster = this._slider.slider.value;
                return;
            }

            this._applyMaster(this._slider.slider.value);
        });

        this._slider.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (!isOpen)
                return;

            const now = Date.now();
            if (now - (this._lastValuesRefresh ?? 0) < 2000)
                return;

            this._lastValuesRefresh = now;
            this._manager.refreshValues().catch(error =>
                logDebug(this._settings, `value refresh failed: ${error.message}`));
        });

        this._slider.slider.connect('drag-begin', () => {
            this._masterDragging = true;
        });

        this._slider.slider.connect('drag-end', () => {
            this._masterDragging = false;
            if (this._pendingMaster !== null) {
                const value = this._pendingMaster;
                this._pendingMaster = null;
                this._applyMaster(value);
            }
        });
    }

    _applyMaster(value) {
        this._manager.applyMaster(value);
        if (this._settings.get_boolean('show-osd'))
            showBrightnessOsd(this._manager.displays, value);
    }

    async _refreshDisplays() {
        if (this._refreshing)
            return;

        this._refreshing = true;
        this._setRefreshBusy(true);
        await this._manager.refresh();
        if (!this._slider)
            return;
        this._refreshing = false;
        this._setRefreshBusy(false);
    }

    _setRefreshBusy(busy) {
        this._refreshItem.sensitive = !busy;
        this._refreshItem.label.text = busy
            ? _('Refreshing displays…')
            : _('Refresh displays');
    }

    refresh() {
        this._signature = '';
        this.sync();
    }

    sync() {
        const displays = this._manager.displays;
        const brightnessDisplays = displays.filter(display =>
            this._manager.getControlRange(display, VCP.BRIGHTNESS) !== null);

        this._slider.visible = brightnessDisplays.length > 0;
        if (!this._slider.visible)
            return;

        this._buildMenuIfNeeded(displays);
        this._syncValues(displays);
    }

    _buildMenuIfNeeded(displays) {
        const signature = JSON.stringify({
            displays: displays.map(display => [
                display.key,
                display.displayNumber,
                display.available,
                [...display.capabilities.supported].sort((a, b) => a - b),
            ]),
            contrast: this._settings.get_boolean('show-contrast'),
            volume: this._settings.get_boolean('show-volume'),
            input: this._settings.get_boolean('show-input'),
            color: this._settings.get_boolean('show-color'),
            rgb: this._settings.get_boolean('show-rgb'),
        });

        if (signature === this._signature)
            return;

        this._signature = signature;
        this._section.removeAll();
        this._rows.clear();
        logDebug(this._settings, `building menu for ${displays.length} display(s)`);

        for (const [index, display] of displays.entries()) {
            if (index > 0)
                this._section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const row = {
                display,
                sliders: [],
                inputItems: [],
                colorItems: [],
                muteItem: null,
                more: null,
            };

            row.header = new PopupMenu.PopupMenuItem('', {reactive: false});
            this._section.addMenuItem(row.header);

            if (this._manager.getControlRange(display, VCP.BRIGHTNESS)) {
                this._addSlider(row, this._section, VCP.BRIGHTNESS, _('Brightness'),
                    _('Brightness of %s').format(this._manager.displayName(display)));
            }

            if (this._hasMoreControls(display)) {
                row.more = new PopupMenu.PopupSubMenuMenuItem(_('More controls'));
                this._section.addMenuItem(row.more);
                this._buildExtras(row);
            }

            // GNOME Shell supports only one open submenu per top-level menu;
            // a submenu inside another submenu closes its parent.  Keep these
            // sibling submenus at the per-monitor level instead.
            if (this._settings.get_boolean('show-input')) {
                this._buildEnumMenu(
                    row, VCP.INPUT_SOURCE, _('Input source'), this._section);
            }
            if (this._settings.get_boolean('show-color')) {
                this._buildEnumMenu(
                    row, VCP.COLOR_PRESET, _('Color preset'), this._section);
            }

            this._rows.set(display.key, row);
        }
    }

    _hasMoreControls(display) {
        if (this._settings.get_boolean('show-contrast') &&
            this._manager.getControlRange(display, VCP.CONTRAST)) {
            return true;
        }

        if (this._settings.get_boolean('show-volume')) {
            if (this._manager.getControlRange(display, VCP.AUDIO_VOLUME) ||
                display.capabilities.supported.has(VCP.AUDIO_MUTE)) {
                return true;
            }
        }

        if (this._settings.get_boolean('show-rgb')) {
            for (const code of [VCP.RED_GAIN, VCP.GREEN_GAIN, VCP.BLUE_GAIN]) {
                if (this._manager.getControlRange(display, code))
                    return true;
            }
        }

        return false;
    }

    _buildExtras(row) {
        const display = row.display;
        const menu = row.more.menu;
        const name = this._manager.displayName(display);

        if (this._settings.get_boolean('show-contrast') &&
            this._manager.getControlRange(display, VCP.CONTRAST)) {
            this._addSlider(row, menu, VCP.CONTRAST, _('Contrast'),
                _('Contrast of %s').format(name));
        }

        if (this._settings.get_boolean('show-volume')) {
            if (this._manager.getControlRange(display, VCP.AUDIO_VOLUME)) {
                this._addSlider(row, menu, VCP.AUDIO_VOLUME, _('Monitor volume'),
                    _('Monitor volume of %s').format(name));
            }

            if (display.capabilities.supported.has(VCP.AUDIO_MUTE)) {
                row.muteItem = new PopupMenu.PopupMenuItem(_('Mute monitor audio'));
                row.muteItem.connect('activate', () => {
                    this._manager.toggleMute(row.display);
                });
                menu.addMenuItem(row.muteItem);
            }
        }

        if (this._settings.get_boolean('show-rgb')) {
            for (const [code, label] of [
                [VCP.RED_GAIN, _('Red gain')],
                [VCP.GREEN_GAIN, _('Green gain')],
                [VCP.BLUE_GAIN, _('Blue gain')],
            ]) {
                if (this._manager.getControlRange(display, code))
                    this._addSlider(row, menu, code, label, `${label} ${name}`);
            }
        }

        if (menu.numMenuItems === 0)
            row.more.visible = false;
    }

    _addSlider(row, menu, code, label, accessibleName) {
        const slider = new Slider(this._manager.getControlFraction(row.display, code) ?? 0);
        slider.accessible_name = accessibleName;
        slider.x_expand = true;

        const item = new PopupMenu.PopupBaseMenuItem({reactive: false});
        item.add_child(new St.Bin({
            style_class: 'slider-bin',
            child: slider,
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));

        const control = {slider, code, dragging: false, pending: null};
        control.notifyId = slider.connect('notify::value', () => {
            if (this._settings.get_string('update-mode') === 'on-release' && control.dragging)
                control.pending = slider.value;
            else
                this._applyControl(row.display, code, slider.value);
        });
        slider.connect('drag-begin', () => {
            control.dragging = true;
        });
        slider.connect('drag-end', () => {
            control.dragging = false;
            if (control.pending !== null) {
                const value = control.pending;
                control.pending = null;
                this._applyControl(row.display, code, value);
            }
        });

        menu.addMenuItem(new PopupMenu.PopupMenuItem(label, {reactive: false}));
        menu.addMenuItem(item);
        row.sliders.push(control);
    }

    _buildEnumMenu(row, code, label, container) {
        const display = row.display;
        const values = permittedValues(display.capabilities, code);

        if (values.length === 0)
            return;

        const submenu = new PopupMenu.PopupSubMenuMenuItem(label);
        const items = [];

        if (code === VCP.COLOR_PRESET) {
            // Menu items close the top-level menu through itemActivated().
            // Keep the color submenu open so presets can be compared.
            submenu.menu.itemActivated = () => {};
        }

        if (code === VCP.INPUT_SOURCE) {
            submenu.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                _('An inactive input may blank the monitor'),
                {reactive: false}));
        }

        for (const value of values) {
            const item = radioItem(valueName(code, value), () => {
                this._manager.setEnum(row.display, code, value);
            });
            submenu.menu.addMenuItem(item);
            items.push({value, item});
        }

        container.addMenuItem(submenu);

        if (code === VCP.INPUT_SOURCE)
            row.inputItems = items;
        else
            row.colorItems = items;
    }

    _applyControl(display, code, value) {
        this._manager.applyControl(display, code, value);

        if (code === VCP.BRIGHTNESS && this._settings.get_boolean('show-osd'))
            showBrightnessOsd([display], value);
    }

    _syncValues(displays) {
        if (!this._masterDragging) {
            this._slider.slider.block_signal_handler(this._masterChangedId);
            this._slider.slider.value = this._manager.getMasterFraction() ?? 0;
            this._slider.slider.unblock_signal_handler(this._masterChangedId);
        }

        for (const display of displays) {
            const row = this._rows.get(display.key);
            if (!row)
                continue;

            // refresh() replaces the display objects; the menu may be kept.
            row.display = display;
            const name = this._manager.displayName(display);
            const brightness = this._manager.getControlFraction(display, VCP.BRIGHTNESS);
            const suffix = !display.available
                ? ` — ${_('unavailable')}`
                : brightness === null ? '' : ` — ${fmtPercent(brightness)}`;

            row.header.label.text = `${name}${suffix}`;

            for (const control of row.sliders) {
                if (control.dragging)
                    continue;
                control.slider.block_signal_handler(control.notifyId);
                control.slider.value = this._manager.getControlFraction(display, control.code) ?? 0;
                control.slider.unblock_signal_handler(control.notifyId);
            }

            if (row.muteItem) {
                const muted = this._manager.getControlValue(display, VCP.AUDIO_MUTE) === 1;
                row.muteItem.label.text = muted
                    ? _('Unmute monitor audio')
                    : _('Mute monitor audio');
            }

            this._syncEnum(row.inputItems,
                this._manager.getControlValue(display, VCP.INPUT_SOURCE));
            this._syncEnum(row.colorItems,
                this._manager.getControlValue(display, VCP.COLOR_PRESET));
        }
    }

    _syncEnum(items, current) {
        for (const {value, item} of items) {
            item.setOrnament(value === current
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE);
        }
    }

    destroy() {
        this._unsubscribe();
        this._slider.menu.destroy();
        this._slider.destroy();
        this._slider = null;
        this._rows.clear();
    }
}
