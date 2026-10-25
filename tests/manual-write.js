// SPDX-License-Identifier: GPL-2.0-or-later
// Writes each monitor's current brightness back to itself, exercising the
// complete write path without changing what is displayed.
//   GSETTINGS_SCHEMA_DIR=$PWD/schemas gjs -m tests/manual-write.js

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {DdcManager} from '../src/core/manager.js';
import {VCP} from '../src/core/capabilities.js';

const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.veld-monitor-controls'});
settings.set_int('write-interval-ms', 20);
const manager = new DdcManager(settings, {
    onWarning: message => print(`warning: ${message}`),
});

await manager.init();
print(`backend: ${manager.backendName}`);

for (const display of manager.displays) {
    const range = manager.getControlRange(display, VCP.BRIGHTNESS);
    const current = manager.getControlValue(display, VCP.BRIGHTNESS);
    if (!range || current === null)
        continue;

    const fraction = current / range.max;
    print(`writing ${current}/${range.max} back to ${manager.displayName(display)}`);
    manager.applyControl(display, VCP.BRIGHTNESS, fraction);
}

await new Promise(resolve => {
    const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    });
    GLib.Source.set_name_by_id(source, '[veld-monitor-controls] manual write wait');
});

for (const display of manager.displays) {
    print(`${manager.displayName(display)}: ${JSON.stringify(display.error)}`);
}

manager.destroy();
