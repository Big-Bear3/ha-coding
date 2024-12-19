import type { Class } from '../types/types';
import { StateManager } from '../managers/state-manager.mjs';

export function Device() {
    return function (c: Class) {
        StateManager.instance.handleEventDefine(c.prototype);
    } as ClassDecorator;
}
