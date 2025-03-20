import type { Class } from '../types/types';
import { StateManager } from '../managers/state-manager.js';

export function Device(): ClassDecorator {
    return function (c: Class) {
        StateManager.instance.handleActionDefine(c.prototype);
    } as ClassDecorator;
}
