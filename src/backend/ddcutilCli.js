// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseCapabilities} from '../core/capabilities.js';
import {hexByte, logError} from '../core/util.js';
import {parseDetectOutput, parseGetVcpLines} from './parsers.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

const ERROR_PATTERNS = [
    /DDC communication failed/i,
    /Verification failed/i,
    /Invalid display/i,
    /No monitor detected/i,
    /Error in/i,
    /failed to/i,
];

export class DdcutilCliBackend {
    constructor(settings = null) {
        this._settings = settings;
        this._destroyed = false;
        this._processes = new Set();
        this._timeouts = new Set();
        this._lock = Promise.resolve();
        this._path = settings?.get_string('ddcutil-path')?.trim() || 'ddcutil';
        this._sleepMultiplier = settings?.get_double('sleep-multiplier') ?? 1.0;
        this._extraArgs = [];

        const extra = settings?.get_string('ddcutil-extra-args')?.trim() ?? '';
        if (extra) {
            try {
                this._extraArgs = GLib.shell_parse_argv(extra)[1];
            } catch (error) {
                logError('ignoring invalid ddcutil-extra-args', error.message);
            }
        }
    }

    get name() {
        return 'ddcutil CLI';
    }

    async init() {
        if (!GLib.find_program_in_path(this._path))
            throw new Error(`ddcutil was not found: ${this._path}`);

        return true;
    }

    _baseArgs() {
        return [
            this._path,
            '--sleep-multiplier', String(this._sleepMultiplier),
            ...this._extraArgs,
        ];
    }

    _spawn(args) {
        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        launcher.setenv('LC_ALL', 'C.UTF-8', true);
        launcher.setenv('LANG', 'C.UTF-8', true);
        return launcher.spawnv(args);
    }

    async _run(args, cancellable = null) {
        if (this._destroyed)
            throw new Error('ddcutil backend destroyed');

        const process = this._spawn(args);
        this._processes.add(process);
        let timedOut = false;
        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 20, () => {
            this._timeouts.delete(timeoutId);
            timedOut = true;
            process.force_exit();
            return GLib.SOURCE_REMOVE;
        });
        this._timeouts.add(timeoutId);

        try {
            const [stdout, stderr] = await process.communicate_utf8_async(null, cancellable);
            const output = `${stdout ?? ''}${stderr ?? ''}`.trim();
            const failed = ERROR_PATTERNS.some(pattern => pattern.test(output));

            if (timedOut)
                throw new Error('ddcutil timed out');
            if (!process.get_successful() || failed)
                throw new Error(output || `ddcutil exited with status ${process.get_exit_status()}`);

            return stdout ?? '';
        } catch (error) {
            if (this._destroyed || error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                throw error;
            throw new Error(error.message || 'ddcutil failed');
        } finally {
            if (this._timeouts.delete(timeoutId))
                GLib.source_remove(timeoutId);
            this._processes.delete(process);
        }
    }

    // One ddcutil process at a time, so displays on the same GPU do not
    // congest the I2C bus.
    async _runSerialized(args, cancellable = null) {
        const previous = this._lock;
        let release;
        this._lock = new Promise(resolve => (release = resolve));
        await previous;

        try {
            return await this._run(args, cancellable);
        } finally {
            release();
        }
    }

    async detect(cancellable = null) {
        const output = await this._runSerialized(
            [...this._baseArgs(), 'detect', '--terse'], cancellable);
        return parseDetectOutput(output);
    }

    async getCapabilities(display, cancellable = null) {
        const output = await this._runSerialized(
            [...this._baseArgs(), '--bus', String(display.bus), 'capabilities', '--brief'],
            cancellable);
        return parseCapabilities(output);
    }

    async getValues(display, codes, cancellable = null) {
        if (codes.length === 0)
            return new Map();

        const output = await this._runSerialized(
            [...this._baseArgs(), 'getvcp', ...codes.map(code => hexByte(code)),
                '--bus', String(display.bus), '--terse'],
            cancellable);

        const values = new Map();
        for (const parsed of parseGetVcpLines(output)) {
            if (!parsed.error)
                values.set(parsed.code, parsed);
        }

        if (values.size === 0) {
            const firstError = parseGetVcpLines(output).find(parsed => parsed.error)?.error;
            throw new Error(firstError || 'No VCP values returned');
        }

        return values;
    }

    async setValue(display, code, value, {verify = false, cancellable = null} = {}) {
        const args = [
            ...this._baseArgs(),
            'setvcp', hexByte(code), String(Math.max(0, Math.round(value))),
            '--bus', String(display.bus),
        ];
        if (!verify)
            args.push('--noverify');

        await this._runSerialized(args, cancellable);
        return true;
    }

    destroy() {
        this._destroyed = true;

        for (const id of this._timeouts)
            GLib.source_remove(id);
        this._timeouts.clear();

        for (const process of this._processes)
            process.force_exit();
        this._processes.clear();
    }
}

export function cliIsAvailable(settings = null) {
    const path = settings?.get_string('ddcutil-path')?.trim() || 'ddcutil';
    return Boolean(GLib.find_program_in_path(path));
}
