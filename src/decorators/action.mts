import { isStaticMember } from '../utils/object-utils.mjs';
import type { Class, MethodDescriptor } from '../types/types';
import { StateManager } from '../managers/state-manager.mjs';

export function Action() {
    return function (c: Class, key: string, methodDescriptor: MethodDescriptor) {
        if (isStaticMember(c)) return;
        StateManager.instance.handleActionState(c, key, methodDescriptor);
    } as MethodDecorator;
}

global.Action = Action as any;
