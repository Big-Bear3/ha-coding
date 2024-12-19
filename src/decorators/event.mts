import { isStaticMember } from '../utils/object-utils.mjs';
import type { Class, MethodDescriptor } from '../types/types';
import { StateManager } from '../managers/state-manager.mjs';

export function Event() {
    return function (c: Class, key: string, methodDescriptor: MethodDescriptor) {
        if (isStaticMember(c)) return;
        StateManager.instance.handleEventState(c, key, methodDescriptor);
    } as MethodDecorator;
}
