// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

// Shell-independent helpers, shared with prefs.js and the tests.

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function normalizeConnector(connector) {
    if (!connector)
        return '';

    return connector
        .trim()
        .replace(/^card\d+-/, '')
        .replace(/^HDMI-A-(\d+)$/, 'HDMI-$1')
        .replace(/^HDMI-B-(\d+)$/, 'HDMI-$1')
        .replace(/^DP-A-(\d+)$/, 'DP-$1')
        .replace(/^DP-B-(\d+)$/, 'DP-$1');
}

export function normalizeName(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
}

export function displayKey(model, serial, connector = '') {
    const modelPart = normalizeName(model) || 'display';
    const serialPart = normalizeName(serial) || normalizeName(connector) || 'unknown';
    return `${modelPart}#${serialPart}`;
}

export function hexByte(value) {
    return Number(value).toString(16).padStart(2, '0').toUpperCase();
}

export function parseNumber(value) {
    if (typeof value === 'number')
        return value;

    if (typeof value !== 'string')
        return NaN;

    if (value.toLowerCase().startsWith('x'))
        return parseInt(value.slice(1), 16);

    return parseInt(value, 10);
}

export function fmtPercent(fraction) {
    return `${Math.round(clamp(fraction, 0, 1) * 100)}%`;
}

export function logDebug(settings, ...args) {
    if (settings?.get_boolean('debug-logging'))
        console.log('[veld-monitor-controls]', ...args);
}

export function logError(...args) {
    console.error('[veld-monitor-controls]', ...args);
}
