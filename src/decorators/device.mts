import type { Class } from '../types/types';
import { StateManager } from '../managers/state-manager.mjs';

export function Device() {
    return function (c: Class) {
        StateManager.instance.handleActionDefine(c.prototype);
    } as ClassDecorator;
}

global.Device = Device as any;
