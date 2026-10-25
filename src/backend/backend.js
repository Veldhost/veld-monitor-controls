// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import {DdcutilCliBackend, cliIsAvailable} from './ddcutilCli.js';
import {DdcutilServiceBackend, serviceIsAvailable} from './ddcutilService.js';

export class BackendUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BackendUnavailableError';
    }
}

// "service" and "cli" use only that backend; "auto" prefers ddcutil-service
// and falls back to the CLI.
export async function createBackend(settings, cancellable = null) {
    const requested = settings.get_string('backend');
    const serviceAvailable = requested === 'cli' ? false : await serviceIsAvailable(cancellable);
    const cliAvailable = requested === 'service' ? false : cliIsAvailable(settings);

    if (requested === 'service') {
        if (!serviceAvailable)
            throw new BackendUnavailableError(
                'ddcutil-service is not available. Install it or select the CLI backend.');
        const backend = new DdcutilServiceBackend(settings);
        await backend.init();
        return backend;
    }

    if (requested === 'cli') {
        if (!cliAvailable)
            throw new BackendUnavailableError('ddcutil is not installed or could not be found.');
        const backend = new DdcutilCliBackend(settings);
        await backend.init();
        return backend;
    }

    if (serviceAvailable) {
        try {
            const backend = new DdcutilServiceBackend(settings);
            await backend.init();
            return backend;
        } catch (error) {
            if (!cliAvailable) {
                throw new BackendUnavailableError(
                    `ddcutil-service failed and ddcutil CLI is unavailable: ${error.message}`);
            }
            console.warn('[veld-monitor-controls] ddcutil-service failed, using CLI:', error.message);
        }
    }

    if (cliAvailable) {
        const backend = new DdcutilCliBackend(settings);
        await backend.init();
        return backend;
    }

    throw new BackendUnavailableError(
        'Neither ddcutil-service nor ddcutil is available. Install ddcutil and/or ddcutil-service.');
}
