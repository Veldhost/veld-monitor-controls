// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import GLib from 'gi://GLib';

import {parseCapabilities, VCP} from '../core/capabilities.js';
import {displayKey} from '../core/util.js';

const CAPS = `mccs_ver(2.2)vcp(02 04 05 08 0B 0C 10 12 14(01 05 06 08 0B) 16 18 1A 60(11 12 0F) 62 8D(01 02) D6(01 05))`;

// Hardware-free backend for development: two DDC monitors with different
// latencies.  The dev/ scripts install it over src/backend/backend.js when
// VMC_MOCK=1, so the relative imports resolve from there.  Never shipped.

function delay(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

export function createBackend() {
    return Promise.resolve(new MockBackend());
}

class MockBackend {
    constructor() {
        this._destroyed = false;
        this._displays = new Map([
            ['mock-msi', {
                displayNumber: 1,
                bus: 'mock-1',
                connector: 'HDMI-1',
                vendor: 'MSI',
                model: 'MSI MP271Q',
                serial: 'MOCK0001',
                key: displayKey('MSI MP271Q', 'MOCK0001', 'HDMI-1'),
                values: new Map([
                    [VCP.BRIGHTNESS, {current: 35, max: 100}],
                    [VCP.CONTRAST, {current: 50, max: 100}],
                    [VCP.COLOR_PRESET, {current: 0x06, max: 0x0b}],
                    [VCP.INPUT_SOURCE, {current: 0x12, max: null}],
                    [VCP.AUDIO_VOLUME, {current: 30, max: 100}],
                    [VCP.AUDIO_MUTE, {current: 2, max: 2}],
                ]),
            }],
            ['mock-lg', {
                displayNumber: 2,
                bus: 'mock-2',
                connector: 'DP-3',
                vendor: 'GSM',
                model: 'LG ULTRAGEAR',
                serial: 'MOCK0002',
                key: displayKey('LG ULTRAGEAR', 'MOCK0002', 'DP-3'),
                values: new Map([
                    [VCP.BRIGHTNESS, {current: 60, max: 100}],
                    [VCP.CONTRAST, {current: 70, max: 100}],
                    [VCP.COLOR_PRESET, {current: 0x0b, max: 0x0b}],
                    [VCP.INPUT_SOURCE, {current: 0x0f, max: null}],
                    [VCP.AUDIO_VOLUME, {current: 50, max: 100}],
                    [VCP.AUDIO_MUTE, {current: 2, max: 2}],
                ]),
            }],
        ]);
    }

    get name() {
        return 'mock backend';
    }

    async detect() {
        await delay(40);
        return [...this._displays.values()].map(display => ({
            displayNumber: display.displayNumber,
            bus: display.bus,
            connector: display.connector,
            vendor: display.vendor,
            model: display.model,
            serial: display.serial,
            edid: '',
            key: display.key,
        }));
    }

    async getCapabilities(display) {
        await delay(30);
        return parseCapabilities(CAPS);
    }

    async getValues(display, codes) {
        await delay(30);
        const source = this._displays.get(this._keyFor(display)) ?? this._displays.values().next().value;
        const values = new Map();
        for (const code of codes) {
            if (source.values.has(code))
                values.set(code, {...source.values.get(code)});
        }
        return values;
    }

    async setValue(display, code, value) {
        await delay(display.connector === 'HDMI-1' ? 90 : 35);
        const source = this._displays.get(this._keyFor(display));
        if (source?.values.has(code)) {
            const previous = source.values.get(code);
            source.values.set(code, {current: value, max: previous.max});
        }
        return true;
    }

    _keyFor(display) {
        for (const [key, candidate] of this._displays) {
            if (candidate.displayNumber === display.displayNumber)
                return key;
        }
        return 'mock-msi';
    }

    destroy() {
        this._destroyed = true;
    }
}
