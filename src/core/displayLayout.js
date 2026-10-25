// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import {callSession} from './dbus.js';
import {normalizeConnector, normalizeName} from './util.js';

const DISPLAY_CONFIG_BUS = 'org.gnome.Mutter.DisplayConfig';
const DISPLAY_CONFIG_PATH = '/org/gnome/Mutter/DisplayConfig';
const DISPLAY_CONFIG_IFACE = 'org.gnome.Mutter.DisplayConfig';
const DISPLAY_CONFIG_STATE_TYPE =
    '(ua((ssss)a(siiddada{sv})a{sv})a(iiduba(ssss)a{sv})a{sv})';

/**
 * Read the current monitor layout from Mutter.  This is used instead of
 * private Meta APIs where possible, and gives us the same connector names,
 * EDID identity and localized display names that GNOME Settings uses.
 */
export async function getMutterDisplays(cancellable = null) {
    const reply = await callSession({
        name: DISPLAY_CONFIG_BUS,
        path: DISPLAY_CONFIG_PATH,
        interfaceName: DISPLAY_CONFIG_IFACE,
        method: 'GetCurrentState',
        replyType: DISPLAY_CONFIG_STATE_TYPE,
        cancellable,
    });

    const [, monitorSpecs, logicalMonitors] = reply.deepUnpack();
    const enabledConnectors = new Set();
    const logicalIndexes = new Map();

    logicalMonitors.forEach((logical, index) => {
        const connectors = logical[5] ?? [];
        for (const [connector] of connectors) {
            const normalized = normalizeConnector(connector);
            enabledConnectors.add(normalized);
            logicalIndexes.set(normalized, index);
        }
    });

    const displays = [];
    for (const [monitorSpec, _modes, properties] of monitorSpecs) {
        const [connector, vendor, model, serial] = monitorSpec;
        if (!connector || connector.startsWith('None'))
            continue;

        const normalizedConnector = normalizeConnector(connector);
        const displayName = properties['display-name']?.unpack() ?? '';

        displays.push({
            connector: normalizedConnector,
            rawConnector: connector,
            vendor: vendor ?? '',
            model: model ?? '',
            serial: serial ?? '',
            name: displayName || [vendor, model].filter(Boolean).join(' ') || normalizedConnector,
            enabled: enabledConnectors.has(normalizedConnector),
            builtin: properties['is-builtin']?.unpack() ?? false,
            logicalIndex: logicalIndexes.get(normalizedConnector) ?? -1,
            key: `${normalizeName(model)}#${normalizeName(serial) || normalizeName(normalizedConnector)}`,
        });
    }

    return displays;
}

/**
 * Match the displays found over DDC/CI with the monitors Mutter knows about.
 * Mutters list is authoritative for names, connectors and which monitors are
 * actually enabled.
 */
export function pairDisplays(mutterDisplays, ddcDisplays) {
    const used = new Set();
    const pairs = [];

    const takeMatch = predicate => {
        const index = mutterDisplays.findIndex((monitor, i) => !used.has(i) && predicate(monitor));
        if (index === -1)
            return null;
        used.add(index);
        return mutterDisplays[index];
    };

    for (const ddc of ddcDisplays) {
        const ddcModel = normalizeName(ddc.model);
        const ddcVendor = normalizeName(ddc.vendor);
        const ddcSerial = normalizeName(ddc.serial);
        const ddcConnector = normalizeConnector(ddc.connector);

        let mutter = null;

        if (ddcConnector) {
            mutter = takeMatch(monitor =>
                normalizeConnector(monitor.connector) === ddcConnector);
        }

        if (!mutter && ddcSerial) {
            mutter = takeMatch(monitor => {
                const model = normalizeName(monitor.model);
                const combined = normalizeName(`${monitor.vendor} ${monitor.model}`);
                const modelMatches = model === ddcModel ||
                    combined === ddcModel ||
                    model.endsWith(ddcModel) ||
                    ddcModel.endsWith(model);

                return normalizeName(monitor.serial) === ddcSerial && modelMatches;
            });
        }

        if (!mutter && ddcSerial) {
            mutter = takeMatch(monitor =>
                normalizeName(monitor.serial) === ddcSerial);
        }

        if (!mutter) {
            mutter = takeMatch(monitor => {
                const model = normalizeName(monitor.model);
                return model === ddcModel || model.endsWith(ddcModel) || ddcModel.endsWith(model);
            });
        }

        const connector = mutter?.connector || ddcConnector || '';
        const model = ddc.model || mutter?.model || 'Display';
        const serial = ddc.serial || mutter?.serial || '';

        pairs.push({
            ...ddc,
            connector,
            name: mutter?.name || model,
            vendor: ddc.vendor || mutter?.vendor || '',
            model,
            serial,
            logicalIndex: mutter?.logicalIndex ?? -1,
            builtin: mutter?.builtin ?? false,
            enabled: mutter?.enabled ?? true,
            key: ddc.key || `${normalizeName(model)}#${normalizeName(serial) || normalizeName(connector)}`,
        });
    }

    return pairs;
}
