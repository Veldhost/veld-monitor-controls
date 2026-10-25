// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Janis and contributors

import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let lastOsdTime = 0;

export function showBrightnessOsd(displays, level) {
    // Dragging a slider changes the value many times per second.
    const now = Date.now();
    if (now - lastOsdTime < 50)
        return;
    lastOsdTime = now;

    const icon = Gio.ThemedIcon.new('display-brightness-symbolic');
    const monitorManager = global.backend.get_monitor_manager();
    const levels = {};

    for (const display of displays) {
        const index = monitorManager.get_monitor_for_connector(display.connector);
        if (index >= 0)
            levels[index] = {level, maxLevel: 1};
    }

    if (Object.keys(levels).length > 0)
        Main.osdWindowManager.show(icon, null, levels);
    else
        Main.osdWindowManager.showAll(icon, null, level, 1);
}
