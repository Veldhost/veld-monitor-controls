// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import Gio from 'gi://Gio';

import {callSession, getSessionProperty} from '../core/dbus.js';
import {parseCapabilities} from '../core/capabilities.js';
import {displayKey} from '../core/util.js';

const SERVICE_NAME = 'com.ddcutil.DdcutilService';
const OBJECT_PATH = '/com/ddcutil/DdcutilObject';
const INTERFACE = 'com.ddcutil.DdcutilInterface';

const DETECT_TYPE = '(ia(iiisssqsu)is)';
const VCP_MULTI_TYPE = '(isayu)';
const VCP_MULTI_REPLY_TYPE = '(a(yqqs)is)';

export class DdcutilServiceBackend {
    constructor() {
        this._cancellable = new Gio.Cancellable();
        this._displayAttributes = null;
    }

    get name() {
        return 'ddcutil-service';
    }

    async init() {
        await getSessionProperty(
            SERVICE_NAME, OBJECT_PATH, INTERFACE, 'ServiceInterfaceVersion',
            this._cancellable, 5000);
    }

    async _call(method, signature, args, replyType = null, cancellable = null) {
        try {
            return await callSession({
                name: SERVICE_NAME,
                path: OBJECT_PATH,
                interfaceName: INTERFACE,
                method,
                signature,
                args,
                replyType,
                cancellable: cancellable ?? this._cancellable,
                timeout: 15000,
            });
        } catch (error) {
            if (this._cancellable.is_cancelled())
                throw error;
            throw new Error(`ddcutil-service ${method} failed: ${error.message}`);
        }
    }

    async _attributes() {
        if (this._displayAttributes)
            return this._displayAttributes;

        const attrs = await getSessionProperty(
            SERVICE_NAME, OBJECT_PATH, INTERFACE, 'AttributesReturnedByDetect',
            this._cancellable, 5000);
        this._displayAttributes = attrs.deepUnpack();
        return this._displayAttributes;
    }

    async detect(cancellable = null) {
        const reply = await this._call('Detect', '(u)', [0], DETECT_TYPE, cancellable);
        const [count, rows, status, message] = reply.deepUnpack();

        if (status !== 0)
            throw new Error(message || `ddcutil detect failed with status ${status}`);

        const attributes = await this._attributes();
        const displays = [];

        for (const row of rows.slice(0, count)) {
            const values = {};
            attributes.forEach((attribute, index) => {
                values[attribute] = row[index];
            });

            const model = values.model_name ?? '';
            const serial = values.serial_number ?? '';
            const connector = values.drm_connector ?? '';

            displays.push({
                displayNumber: values.display_number,
                bus: values.i2c_bus ? String(values.i2c_bus) : null,
                connector,
                vendor: values.manufacturer_id ?? '',
                model,
                serial,
                edid: values.edid_txt ?? '',
                binarySerial: values.binary_serial_number ?? null,
                key: displayKey(model, serial, connector),
            });
        }

        return displays;
    }

    async getCapabilities(display, cancellable = null) {
        const reply = await this._call(
            'GetCapabilitiesString',
            '(isu)',
            [display.displayNumber, '', 0],
            '(sis)',
            cancellable);

        const [text, status, message] = reply.deepUnpack();
        if (status !== 0)
            throw new Error(message || `Could not read capabilities (status ${status})`);

        return parseCapabilities(text);
    }

    async getValues(display, codes, cancellable = null) {
        if (codes.length === 0)
            return new Map();

        const reply = await this._call(
            'GetMultipleVcp',
            VCP_MULTI_TYPE,
            [display.displayNumber, '', codes, 0],
            VCP_MULTI_REPLY_TYPE,
            cancellable);

        const [entries, status, message] = reply.deepUnpack();
        if (status !== 0)
            throw new Error(message || `Could not read VCP values (status ${status})`);

        const values = new Map();
        for (const [code, current, max, formatted] of entries)
            values.set(code, {current, max, formatted});

        return values;
    }

    async setValue(display, code, value, {verify = false, cancellable = null} = {}) {
        const flags = verify ? 0 : 4; // 4 = NO_VERIFY
        const reply = await this._call(
            'SetVcp',
            '(isyqu)',
            [display.displayNumber, '', code, Math.max(0, Math.round(value)), flags],
            '(is)',
            cancellable);

        const [status, message] = reply.deepUnpack();
        if (status !== 0)
            throw new Error(message || `ddcutil setvcp failed with status ${status}`);

        return true;
    }

    destroy() {
        this._cancellable.cancel();
    }
}

export async function serviceIsAvailable(cancellable = null) {
    try {
        const version = await getSessionProperty(
            SERVICE_NAME, OBJECT_PATH, INTERFACE, 'ServiceInterfaceVersion',
            cancellable, 4000);
        return Boolean(version);
    } catch {
        return false;
    }
}
