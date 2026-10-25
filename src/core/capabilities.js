// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

export const VCP = Object.freeze({
    BRIGHTNESS: 0x10,
    CONTRAST: 0x12,
    COLOR_PRESET: 0x14,
    RED_GAIN: 0x16,
    GREEN_GAIN: 0x18,
    BLUE_GAIN: 0x1a,
    INPUT_SOURCE: 0x60,
    AUDIO_VOLUME: 0x62,
    AUDIO_MUTE: 0x8d,
});

export const INPUT_NAMES = Object.freeze({
    0x01: 'Analog 1',
    0x02: 'Analog 2',
    0x03: 'DVI-1',
    0x04: 'DVI-2',
    0x05: 'Composite-1',
    0x06: 'Composite-2',
    0x07: 'S-Video-1',
    0x08: 'S-Video-2',
    0x0f: 'DisplayPort-1',
    0x10: 'DisplayPort-2',
    0x11: 'HDMI-1',
    0x12: 'HDMI-2',
    0x13: 'HDMI-3',
    0x14: 'HDMI-4',
    0x1b: 'USB-C',
});

export const COLOR_NAMES = Object.freeze({
    0x01: 'sRGB',
    0x02: 'Native',
    0x03: '4000 K',
    0x04: '5000 K',
    0x05: '6500 K',
    0x06: '7500 K',
    0x07: '8200 K',
    0x08: '9300 K',
    0x09: '10000 K',
    0x0a: '11500 K',
    0x0b: 'User 1',
    0x0c: 'User 2',
    0x0d: 'User 3',
});

export function valueName(code, value) {
    if (code === VCP.INPUT_SOURCE)
        return INPUT_NAMES[value] ?? `Input 0x${value.toString(16).padStart(2, '0')}`;
    if (code === VCP.COLOR_PRESET)
        return COLOR_NAMES[value] ?? `Preset 0x${value.toString(16).padStart(2, '0')}`;
    if (code === VCP.AUDIO_MUTE)
        return value === 1 ? 'Muted' : 'Unmuted';
    return `0x${Number(value).toString(16).padStart(2, '0')}`;
}

function findMatchingParen(text, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === '(')
            depth++;
        else if (text[i] === ')') {
            depth--;
            if (depth === 0)
                return i;
        }
    }
    return -1;
}

/**
 * Parse the MCCS capabilities string (the text inside the outer parentheses
 * printed by `ddcutil capabilities --brief` and returned by ddcutil-service).
 *
 * Returns the set of supported VCP codes and, where present, the permitted
 * values for enumerated controls.
 */
export function parseCapabilities(rawText) {
    const result = {
        supported: new Set(),
        values: new Map(),
        mccs: null,
    };

    if (!rawText)
        return result;

    const mccsMatch = String(rawText).match(/mccs_ver\(\s*([0-9.]+)\s*\)/i);
    if (mccsMatch)
        result.mccs = mccsMatch[1];

    const vcpIndex = String(rawText).indexOf('vcp(');
    if (vcpIndex === -1)
        return result;

    const openIndex = vcpIndex + 3; // points at '('
    const closeIndex = findMatchingParen(rawText, openIndex);
    if (closeIndex === -1)
        return result;

    const body = rawText.slice(openIndex + 1, closeIndex);
    let position = 0;

    while (position < body.length) {
        while (position < body.length && /\s/.test(body[position]))
            position++;

        if (position >= body.length)
            break;

        const codeMatch = body.slice(position).match(/^([0-9a-f]{2})(?![0-9a-f])/i);
        if (!codeMatch) {
            position++;
            continue;
        }

        const code = parseInt(codeMatch[1], 16);
        position += 2;
        result.supported.add(code);

        while (position < body.length && /\s/.test(body[position]))
            position++;

        if (body[position] !== '(')
            continue;

        const valuesOpen = position;
        const valuesClose = findMatchingParen(body, valuesOpen);
        if (valuesClose === -1)
            break;

        const valuesBody = body.slice(valuesOpen + 1, valuesClose);
        const values = [];
        for (const token of valuesBody.match(/[0-9a-f]{2}(?![0-9a-f])/gi) ?? [])
            values.push(parseInt(token, 16));

        result.values.set(code, values);
        position = valuesClose + 1;
    }

    return result;
}

export function permittedValues(capabilities, code) {
    return capabilities?.values?.get(code) ?? [];
}
