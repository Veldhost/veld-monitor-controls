// SPDX-License-Identifier: GPL-2.0-or-later
// Run with: gjs -m tests/run.js

import GLib from 'gi://GLib';

import {normalizeConnector} from '../src/core/util.js';
import {parseCapabilities, VCP, valueName} from '../src/core/capabilities.js';
import {parseDetectOutput, parseGetVcpLines} from '../src/backend/parsers.js';
import {pairDisplays} from '../src/core/displayLayout.js';
import {DdcManager} from '../src/core/manager.js';

let failures = 0;

function check(name, condition, detail = '') {
    if (condition) {
        print(`ok   ${name}`);
    } else {
        failures++;
        printerr(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
    }
}

function equal(name, actual, expected) {
    check(name, JSON.stringify(actual) === JSON.stringify(expected),
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const detectText = `Display 1
   I2C bus:          /dev/i2c-6
   DRM connector:    card1-HDMI-A-1
   drm_connector_id: 415
   Monitor:          MSI:MSI MP271Q:TESTSERIAL001

Display 2
   I2C bus:          /dev/i2c-10
   DRM connector:    card1-DP-3
   drm_connector_id: 408
   Monitor:          GSM:LG ULTRAGEAR:TESTSERIAL002
`;

const parseGetVcpOutput = text => parseGetVcpLines(text)[0] ?? {error: 'No VCP response'};

const displays = parseDetectOutput(detectText);
equal('detect count', displays.length, 2);
equal('detect connector normalization', displays[0].connector, 'HDMI-1');
equal('detect bus', displays[0].bus, '6');
equal('detect vendor', displays[0].vendor, 'MSI');
equal('detect model', displays[0].model, 'MSI MP271Q');
equal('detect serial', displays[0].serial, 'TESTSERIAL001');
equal('detect key', displays[0].key, 'msi mp271q#testserial001');
equal('detect second connector', displays[1].connector, 'DP-3');

check('phantom display ignored', parseDetectOutput(`Phantom display\n   I2C bus: /dev/i2c-99\n`) .length === 0);

equal('continuous VCP', parseGetVcpOutput('VCP 10 C 4 100'), {
    code: 0x10,
    current: 4,
    max: 100,
    type: 'C',
    formatted: 'VCP 10 C 4 100',
});

equal('CNC VCP', parseGetVcpOutput('VCP 62 CNC x00 x64 x00 x32'), {
    code: 0x62,
    current: 50,
    max: 100,
    type: 'CNC',
    formatted: 'VCP 62 CNC x00 x64 x00 x32',
});

equal('SNC VCP', parseGetVcpOutput('VCP 60 SNC x12'), {
    code: 0x60,
    current: 18,
    max: null,
    type: 'SNC',
    formatted: 'VCP 60 SNC x12',
});

check('VCP error', Boolean(parseGetVcpOutput('No monitor detected').error));

const multiple = parseGetVcpLines('VCP 10 C 4 100\nVCP 12 C 50 100');
equal('multiple VCP codes', multiple.map(value => value.code), [0x10, 0x12]);
equal('multiple VCP values', multiple.map(value => value.current), [4, 50]);

const capabilities = parseCapabilities(
    'Unparsed capabilities string: (prot(monitor)type(lcd)mccs_ver(2.2)vcp(02 04 05 08 0B 0C 10 12 14(01 05 06 08 0B) 16 18 1A 52 60( 11 12 0F) 62 6C 6E 70 8D(01 02) AA(01 02) AC AE B6 C0 C6 C8 C9 CA(01 02) CC(02 02 03 04 05 07 08 09 0A 0D 01 06 0B 12 14 16 1E) D6(01 05) DF FF)mswhql(1)asset_eep(40))');

check('capabilities brightness', capabilities.supported.has(VCP.BRIGHTNESS));
check('capabilities contrast', capabilities.supported.has(VCP.CONTRAST));
check('capabilities input', capabilities.supported.has(VCP.INPUT_SOURCE));
check('capabilities color', capabilities.supported.has(VCP.COLOR_PRESET));
check('capabilities volume', capabilities.supported.has(VCP.AUDIO_VOLUME));
check('capabilities mccs', capabilities.mccs === '2.2');
equal('input values', capabilities.values.get(VCP.INPUT_SOURCE), [0x11, 0x12, 0x0f]);
equal('color values', capabilities.values.get(VCP.COLOR_PRESET), [0x01, 0x05, 0x06, 0x08, 0x0b]);
equal('input name', valueName(VCP.INPUT_SOURCE, 0x12), 'HDMI-2');

equal('connector DP', normalizeConnector('card1-DP-3'), 'DP-3');
equal('connector HDMI', normalizeConnector('card1-HDMI-A-1'), 'HDMI-1');

const mutter = [
    {connector: 'DP-3', vendor: 'GSM', model: 'LG ULTRAGEAR', serial: 'TESTSERIAL002', name: 'LG ULTRAGEAR', logicalIndex: 0, builtin: false, enabled: true},
    {connector: 'HDMI-1', vendor: 'MSI', model: 'MSI MP271Q', serial: 'TESTSERIAL001', name: 'MSI MP271Q', logicalIndex: 1, builtin: false, enabled: true},
];

const paired = pairDisplays(mutter, displays);
equal('pair by connector and serial', paired.map(p => p.connector), ['HDMI-1', 'DP-3']);
equal('pair names', paired.map(p => p.name), ['MSI MP271Q', 'LG ULTRAGEAR']);

// The first write to a control must reach the monitor.
const settings = {
    get_int: () => 0,
    get_boolean: () => false,
    get_strv: () => [],
    get_value: () => new GLib.Variant('a{ss}', {}),
};
const writes = [];
const manager = new DdcManager(settings);
manager._backend = {
    setValue: (display, code, value) => {
        writes.push([code, value]);
        return Promise.resolve(true);
    },
    destroy() {},
};
const monitor = {
    key: 'test#1',
    displayNumber: 1,
    name: 'Test',
    capabilities: {supported: new Set([VCP.BRIGHTNESS]), values: new Map()},
    values: {[VCP.BRIGHTNESS]: {current: 30, max: 100}},
};
manager._displays = [monitor];
manager.applyControl(monitor, VCP.BRIGHTNESS, 0.8);
equal('first write is sent', writes, [[VCP.BRIGHTNESS, 80]]);
manager.destroy();

if (failures > 0) {
    printerr(`${failures} test(s) failed`);
    imports.system.exit(1);
}

print('all tests passed');
