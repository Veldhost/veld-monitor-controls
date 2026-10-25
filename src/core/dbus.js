// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Promise wrapper around Gio.DBusConnection.call() on the session bus.
export function callSession({
    name,
    path,
    interfaceName,
    method,
    signature = null,
    args = null,
    replyType = null,
    cancellable = null,
    timeout = -1,
}) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(
            name,
            path,
            interfaceName,
            method,
            signature ? new GLib.Variant(signature, args) : null,
            replyType ? new GLib.VariantType(replyType) : null,
            Gio.DBusCallFlags.NONE,
            timeout,
            cancellable,
            (connection, result) => {
                try {
                    resolve(connection.call_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
    });
}

export function getSessionProperty(name, path, interfaceName, property,
    cancellable = null, timeout = -1) {
    return callSession({
        name,
        path,
        interfaceName: 'org.freedesktop.DBus.Properties',
        method: 'Get',
        signature: '(ss)',
        args: [interfaceName, property],
        replyType: '(v)',
        cancellable,
        timeout,
    }).then(reply => reply.deepUnpack()[0]);
}
