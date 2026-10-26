// SPDX-License-Identifier: GPL-2.0-or-later
// Manual hardware smoke test. Run with:
//   GSETTINGS_SCHEMA_DIR=$PWD/schemas gjs -m tests/manual-backend.js
// It only reads from the monitors; it never changes them.

import Gio from 'gi://Gio';

import {createBackend} from '../src/backend/backend.js';
import {getMutterDisplays, pairDisplays} from '../src/core/displayLayout.js';
import {VCP} from '../src/core/capabilities.js';

const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.veld-monitor-controls'});
const requested = settings.get_string('backend');
print(`backend setting: ${requested}`);

const backend = await createBackend(settings);
print(`using: ${backend.name}`);

const ddc = await backend.detect();
print(`detected: ${ddc.length}`);
for (const display of ddc)
    print(`  ${display.displayNumber}: ${display.vendor} ${display.model} / ${display.serial} / ${display.key}`);

const mutter = await getMutterDisplays();
print(`mutter: ${mutter.length}`);
for (const display of mutter)
    print(`  ${display.connector}: ${display.name} / ${display.vendor} ${display.model} / ${display.serial}`);

const paired = pairDisplays(mutter, ddc);
print(`paired: ${paired.length}`);
for (const display of paired) {
    print(`  ${display.name} (${display.connector})`);
    try {
        const caps = await backend.getCapabilities(display);
        print(`    capabilities: ${[...caps.supported].map(code => code.toString(16)).join(' ')}`);
        const values = await backend.getValues(display,
            [VCP.BRIGHTNESS, VCP.CONTRAST, VCP.COLOR_PRESET,
                VCP.INPUT_SOURCE, VCP.AUDIO_VOLUME, VCP.AUDIO_MUTE]);
        for (const [code, value] of values)
            print(`    VCP ${code.toString(16)}: ${JSON.stringify(value)}`);
    } catch (error) {
        print(`    error: ${error.message}`);
    }
}

backend.destroy();
