// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {createBackend} from '../backend/backend.js';
import {VCP} from './capabilities.js';
import {getMutterDisplays, pairDisplays} from './displayLayout.js';
import {clamp, logDebug} from './util.js';

const READ_ONLY_CODES = new Set([VCP.INPUT_SOURCE, VCP.COLOR_PRESET]);

// Owns the DDC backend and the current display values.  No Shell imports.
export class DdcManager {
    constructor(settings, {onWarning = () => {}} = {}) {
        this._settings = settings;
        this._onWarning = onWarning;
        this._backend = null;
        this._displays = [];
        this._listeners = new Set();
        this._cancellable = new Gio.Cancellable();
        this._refreshing = false;
        this._refreshingValues = false;
        this._queues = new Map();
        this._timeouts = new Set();
        this._warned = new Set();
        this._writeInterval = settings.get_int('write-interval-ms');
    }

    get displays() {
        const hidden = new Set(this._settings.get_strv('hidden-displays'));
        return this._displays.filter(display => !hidden.has(display.key));
    }

    get refreshing() {
        return this._refreshing;
    }

    get hasBrightness() {
        return this.displays.some(display => this._brightnessRange(display) !== null);
    }

    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _emit() {
        for (const listener of [...this._listeners])
            listener(this);
    }

    _warn(key, message) {
        logDebug(this._settings, `warning [${key}]: ${message}`);
        if (this._warned.has(key))
            return;
        this._warned.add(key);
        this._onWarning(message);
    }

    // Also used to reload the backend after its settings change.
    async init() {
        this._backend?.destroy();
        this._backend = null;
        this._warned.clear();

        let backend;
        try {
            backend = await createBackend(this._settings, this._cancellable);
        } catch (error) {
            if (this._cancellable.is_cancelled())
                return false;
            this._warn('backend', error.message);
            this._emit();
            return false;
        }

        if (this._cancellable.is_cancelled()) {
            backend.destroy();
            return false;
        }

        this._backend?.destroy();
        this._backend = backend;
        return this.refresh();
    }

    async refresh() {
        if (!this._backend || this._refreshing)
            return false;

        this._refreshing = true;
        this._emit();

        try {
            const layout = await getMutterDisplays(this._cancellable);
            const detected = await this._backend.detect(this._cancellable);
            const paired = pairDisplays(layout, detected);
            const displays = [];

            for (const display of paired) {
                if (this._cancellable.is_cancelled())
                    return false;

                const result = {...display};
                result.capabilities = {supported: new Set(), values: new Map()};

                try {
                    result.capabilities = await this._backend.getCapabilities(
                        result, this._cancellable);
                } catch (error) {
                    logDebug(this._settings, `capabilities failed for ${result.name}: ${error.message}`);
                }

                const codes = this._codesFor(result);
                result.values = {};

                try {
                    const values = await this._readValues(result, codes);
                    for (const [code, value] of values) {
                        result.values[code] = {...value};
                        result.capabilities.supported.add(code);
                    }
                    result.available = values.size > 0;
                    result.error = null;
                } catch (error) {
                    result.available = false;
                    result.error = error.message;
                    logDebug(this._settings, `values failed for ${result.name}: ${error.message}`);

                    // Brightness is the one control we must not silently lose.
                    if (!result.capabilities.supported.has(VCP.BRIGHTNESS)) {
                        try {
                            const values = await this._readValues(result, [VCP.BRIGHTNESS]);
                            const value = values.get(VCP.BRIGHTNESS);
                            if (value) {
                                result.values[VCP.BRIGHTNESS] = {...value};
                                result.capabilities.supported.add(VCP.BRIGHTNESS);
                                result.available = true;
                                result.error = null;
                            }
                        } catch {
                            // Keep the unavailable state
                        }
                    }
                }

                if (result.values[VCP.BRIGHTNESS])
                    result.capabilities.supported.add(VCP.BRIGHTNESS);

                displays.push(result);
            }

            if (this._cancellable.is_cancelled())
                return false;

            this._displays = displays;
            return true;
        } catch (error) {
            if (this._cancellable.is_cancelled())
                return false;

            this._warn('refresh', error.message);
            return false;
        } finally {
            this._refreshing = false;
            this._emit();
        }
    }

    async refreshValues() {
        if (!this._backend || this._refreshingValues)
            return false;

        this._refreshingValues = true;

        try {
            for (const display of this._displays) {
                if (!display.available)
                    continue;

                const codes = this._codesFor(display).filter(code =>
                    display.capabilities.supported.has(code));
                if (codes.length === 0)
                    continue;

                try {
                    const values = await this._readValues(display, codes);
                    for (const [code, value] of values)
                        display.values[code] = {...value};
                    display.error = null;
                } catch (error) {
                    display.error = error.message;
                }
            }

            this._emit();
            return true;
        } finally {
            this._refreshingValues = false;
        }
    }

    /**
     * Read a group of VCP codes.  If the backend's batch request fails
     * because one monitor rejects a single feature, retry the codes
     * individually so the supported controls still work.
     */
    async _readValues(display, codes) {
        try {
            return await this._backend.getValues(display, codes, this._cancellable);
        } catch (batchError) {
            if (codes.length <= 1)
                throw batchError;

            const values = new Map();
            let lastError = batchError;

            for (const code of codes) {
                try {
                    const one = await this._backend.getValues(
                        display, [code], this._cancellable);
                    for (const [key, value] of one)
                        values.set(key, value);
                } catch (error) {
                    lastError = error;
                }
            }

            if (values.size === 0)
                throw lastError;

            return values;
        }
    }

    _codesFor(display) {
        const codes = [VCP.BRIGHTNESS];

        if (this._settings.get_boolean('show-contrast'))
            codes.push(VCP.CONTRAST);
        if (this._settings.get_boolean('show-volume'))
            codes.push(VCP.AUDIO_VOLUME, VCP.AUDIO_MUTE);
        if (this._settings.get_boolean('show-input'))
            codes.push(VCP.INPUT_SOURCE);
        if (this._settings.get_boolean('show-color'))
            codes.push(VCP.COLOR_PRESET);
        if (this._settings.get_boolean('show-rgb'))
            codes.push(VCP.RED_GAIN, VCP.GREEN_GAIN, VCP.BLUE_GAIN);

        // Do not request capabilities that are plainly absent.  Brightness is
        // always attempted because some monitors report incomplete capability
        // strings.
        if (display.capabilities.supported.size > 0) {
            return [...new Set(codes)].filter(code =>
                code === VCP.BRIGHTNESS || display.capabilities.supported.has(code));
        }

        return [...new Set(codes)];
    }

    _brightnessRange(display) {
        if (!display.capabilities.supported.has(VCP.BRIGHTNESS))
            return null;

        const value = display.values[VCP.BRIGHTNESS];
        if (!value)
            return null;

        return {min: 0, max: value.max || 100};
    }

    getControlRange(display, code) {
        if (code === VCP.BRIGHTNESS)
            return this._brightnessRange(display);

        if (!display.capabilities.supported.has(code))
            return null;

        const value = display.values[code];
        if (READ_ONLY_CODES.has(code) || !value || value.max === null || value.max === 0)
            return null;

        return {min: 0, max: value.max};
    }

    getControlValue(display, code) {
        return display.values[code]?.current ?? null;
    }

    getControlFraction(display, code) {
        const range = this.getControlRange(display, code);
        if (!range)
            return null;

        return clamp((this.getControlValue(display, code) ?? 0) / range.max, 0, 1);
    }

    getMasterFraction() {
        const fractions = this.displays
            .map(display => this.getControlFraction(display, VCP.BRIGHTNESS))
            .filter(value => value !== null);

        if (fractions.length === 0)
            return null;

        return Math.max(...fractions);
    }

    _minimumRaw(display, code) {
        const range = this.getControlRange(display, code);
        if (!range)
            return 0;

        if (code !== VCP.BRIGHTNESS)
            return 0;

        if (this._settings.get_boolean('allow-zero-brightness'))
            return range.min;

        const percent = this._settings.get_int('min-brightness-percent');
        return Math.max(1, Math.round((percent / 100) * range.max));
    }

    applyMaster(fraction) {
        for (const display of this.displays) {
            const range = this._brightnessRange(display);
            if (!range)
                continue;

            const min = this._minimumRaw(display, VCP.BRIGHTNESS);
            const raw = clamp(Math.round(fraction * range.max), min, range.max);
            display.values[VCP.BRIGHTNESS] = {
                ...display.values[VCP.BRIGHTNESS] ?? {},
                current: raw,
                max: range.max,
            };
            this._queueWrite(display, VCP.BRIGHTNESS, raw);
        }

        this._emit();
    }

    applyControl(display, code, fraction) {
        const range = this.getControlRange(display, code);
        if (!range)
            return;

        const min = this._minimumRaw(display, code);
        const raw = clamp(Math.round(fraction * range.max), min, range.max);
        display.values[code] = {
            ...display.values[code] ?? {},
            current: raw,
            max: range.max,
        };
        this._queueWrite(display, code, raw);
        this._emit();
    }

    setEnum(display, code, value) {
        if (!display.capabilities.supported.has(code))
            return;

        display.values[code] = {
            ...display.values[code] ?? {},
            current: value,
        };
        this._queueWrite(display, code, value);
        this._emit();
    }

    toggleMute(display) {
        const current = this.getControlValue(display, VCP.AUDIO_MUTE);
        this.setEnum(display, VCP.AUDIO_MUTE, current === 1 ? 2 : 1);
    }

    _queueWrite(display, code, value) {
        const queueKey = `${display.key}:${display.displayNumber}:${code}`;
        let queue = this._queues.get(queueKey);

        if (!queue) {
            queue = {code, pending: null, writing: false, last: null};
            this._queues.set(queueKey, queue);
        }

        queue.display = display;
        queue.pending = value;

        if (!queue.writing)
            this._drain(queue, queueKey);
    }

    async _drain(queue, queueKey) {
        queue.writing = true;

        try {
            while (!this._cancellable.is_cancelled() && queue.pending !== null) {
                const value = queue.pending;
                queue.pending = null;

                if (value === queue.last)
                    continue;

                const started = Date.now();

                try {
                    await this._backend.setValue(
                        queue.display,
                        queue.code,
                        value,
                        {
                            verify: this._settings.get_boolean('verify-writes'),
                            cancellable: this._cancellable,
                        });
                    queue.last = value;
                    queue.display.error = null;
                } catch (error) {
                    if (this._cancellable.is_cancelled())
                        break;

                    queue.display.error = error.message;
                    this._warn(`write:${queueKey}`, error.message);
                }

                const elapsed = Date.now() - started;
                if (this._writeInterval > elapsed)
                    await this._sleep(this._writeInterval - elapsed);
            }
        } finally {
            queue.writing = false;
            this._emit();
        }
    }

    _sleep(ms) {
        return new Promise(resolve => {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                this._timeouts.delete(id);
                resolve();
                return GLib.SOURCE_REMOVE;
            });
            this._timeouts.add(id);
        });
    }

    displayName(display) {
        const names = this._settings.get_value('custom-names').deepUnpack();
        return names[display.key] || display.name;
    }

    updateSettings() {
        this._writeInterval = this._settings.get_int('write-interval-ms');
    }

    destroy() {
        this._cancellable.cancel();
        this._backend?.destroy();

        for (const id of this._timeouts)
            GLib.source_remove(id);
        this._timeouts.clear();

        for (const queue of this._queues.values())
            queue.pending = null;
        this._queues.clear();
        this._listeners.clear();
        this._displays = [];
    }
}
