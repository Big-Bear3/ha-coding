import { isStaticMember } from '../utils/object-utils.mjs';
import { StateManager } from '../managers/state-manager.mjs';
import type { Class, ObjectKey } from '../types/types';

export function State() {
    return function (c: Class, key: ObjectKey) {
        if (isStaticMember(c)) return;
        StateManager.instance.handleState(c, key);
    } as PropertyDecorator;
}

global.State = State as any;
