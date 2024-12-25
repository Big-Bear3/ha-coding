import { StateManager } from '../managers/state-manager.js';

export interface Ref<T = any> {
    value: T;
    trigger: () => void;
}

export function ref<T>(value?: T): Ref<T> {
    const refObj: Ref = {
        value,
        trigger: () => {
            StateManager.instance.triggerRef(refObj);
        }
    };

    StateManager.instance.handleRef(refObj);
    return refObj;
}
