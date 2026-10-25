// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import {normalizeConnector, normalizeName, parseNumber} from '../core/util.js';

/**
 * Parse `ddcutil detect --terse` output.  Kept free of Gio so it can be
 * tested with plain gjs.
 */
export function parseDetectOutput(text) {
    const displays = [];
    let current = null;

    const finish = () => {
        if (!current)
            return;

        if (current.bus || current.connector || current.model) {
            current.key = `${normalizeName(current.model) || 'display'}#${normalizeName(current.serial) || normalizeName(current.connector) || 'unknown'}`;
            displays.push(current);
        }
        current = null;
    };

    for (const rawLine of String(text ?? '').split('\n')) {
        const line = rawLine.trim();

        if (/^(Invalid|Phantom) display\b/i.test(line)) {
            current = null;
            continue;
        }

        const displayMatch = line.match(/^Display\s+(\d+)\b/i);
        if (displayMatch) {
            finish();
            current = {
                displayNumber: parseInt(displayMatch[1], 10),
                bus: null,
                connector: '',
                vendor: '',
                model: '',
                serial: '',
            };
            continue;
        }

        if (!current)
            continue;

        if (line.startsWith('I2C bus:')) {
            const bus = line.slice(line.indexOf(':') + 1).trim();
            const busMatch = bus.match(/i2c-(\d+)/);
            current.bus = busMatch ? busMatch[1] : bus;
        } else if (line.startsWith('DRM connector:')) {
            current.connector = normalizeConnector(line.slice(line.indexOf(':') + 1).trim());
        } else if (line.startsWith('Monitor:')) {
            const monitor = line.slice(line.indexOf(':') + 1).trim();
            const parts = monitor.split(':');
            if (parts.length >= 3) {
                current.vendor = parts[0].trim();
                current.serial = parts[parts.length - 1].trim();
                current.model = parts.slice(1, -1).join(':').trim();
            } else {
                current.model = monitor;
            }
        }
    }

    finish();
    return displays;
}

/**
 * Parse one or more `ddcutil getvcp <codes...> --terse` lines.
 *
 * Examples:
 *   VCP 10 C 4 100
 *   VCP 62 CNC x00 x64 x00 x32
 *   VCP 60 SNC x12
 */
export function parseGetVcpLines(text) {
    const results = [];

    for (const rawLine of String(text ?? '').split('\n')) {
        const line = rawLine.trim();
        if (!line)
            continue;

        if (/No monitor detected/i.test(line)) {
            results.push({error: 'No monitor detected'});
            continue;
        }

        const match = line.match(/^VCP\s+([0-9a-f]{2})\s+(C|CNC|SNC|NC)\s+(.*)$/i);
        if (!match)
            continue;

        const code = parseInt(match[1], 16);
        const type = match[2].toUpperCase();
        const tokens = match[3].trim().split(/\s+/).filter(Boolean);

        if (type === 'C') {
            const current = parseNumber(tokens[0]);
            const max = parseNumber(tokens[1]);
            if (Number.isNaN(current) || Number.isNaN(max)) {
                results.push({code, error: `Invalid continuous value: ${line}`});
                continue;
            }
            results.push({code, current, max, type, formatted: line});
            continue;
        }

        if (type === 'CNC') {
            // VCP 62 CNC x00 x64 x00 x32
            //              ^min ^max ^?   ^current
            if (tokens.length < 4) {
                results.push({code, error: `Invalid CNC value: ${line}`});
                continue;
            }

            const max = parseNumber(tokens[1]);
            const current = parseNumber(tokens[tokens.length - 1]);
            if (Number.isNaN(current) || Number.isNaN(max)) {
                results.push({code, error: `Invalid CNC value: ${line}`});
                continue;
            }
            results.push({code, current, max, type, formatted: line});
            continue;
        }

        if (type === 'SNC') {
            const current = parseNumber(tokens[0]);
            if (Number.isNaN(current)) {
                results.push({code, error: `Invalid SNC value: ${line}`});
                continue;
            }
            results.push({code, current, max: null, type, formatted: line});
            continue;
        }

        results.push({code, error: `Unsupported VCP response: ${line}`});
    }

    return results;
}
