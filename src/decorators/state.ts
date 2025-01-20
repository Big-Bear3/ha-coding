import type { Class, ObjectKey } from '../types/types';
import type { CallInfoGetter } from '../services/call-service';
import { isStaticMember } from '../utils/object-utils.js';
import { StateManager } from '../managers/state-manager.js';

export function State(callInfoGetter?: CallInfoGetter) {
    return function (c: Class, key: ObjectKey) {
        if (isStaticMember(c)) return;
        StateManager.instance.handleState(c, key, callInfoGetter);
    } as PropertyDecorator;
}
