// SPDX-License-Identifier: GPL-2.0-or-later
// Read-only manager smoke test:
//   GSETTINGS_SCHEMA_DIR=$PWD/schemas gjs -m tests/manual-manager.js

import Gio from 'gi://Gio';

import {DdcManager} from '../src/core/manager.js';
import {VCP} from '../src/core/capabilities.js';

const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.veld-monitor-controls'});
const manager = new DdcManager(settings, {
    onWarning: message => print(`warning: ${message}`),
});

const ok = await manager.init();
print(`init: ${ok}`);
print(`master: ${manager.getMasterFraction()}`);

for (const display of manager.displays) {
    print(`${manager.displayName(display)} (${display.connector}) available=${display.available}`);
    print(`  key=${display.key}`);
    for (const code of [VCP.BRIGHTNESS, VCP.CONTRAST, VCP.COLOR_PRESET, VCP.INPUT_SOURCE, VCP.AUDIO_VOLUME, VCP.AUDIO_MUTE]) {
        print(`  ${code.toString(16)}: value=${manager.getControlValue(display, code)} range=${JSON.stringify(manager.getControlRange(display, code))}`);
    }
}

manager.destroy();
