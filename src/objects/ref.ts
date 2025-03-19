import { StateManager } from '../managers/state-manager.js';

export interface Ref<T = any> {
    value: T;
    trigger: () => void;
    asPersistent: (key: string) => Ref<T>;
}

export function ref<T>(value?: T): Ref<T> {
    const stateManager = StateManager.instance;

    let persistentKey: string;

    const refObj: Ref = {
        value,
        trigger: () => {
            stateManager.triggerRef(refObj);
        },
        asPersistent: (key: string): Ref => {
            persistentKey = key;
            stateManager.setRefAsPersistent(refObj, persistentKey);
            return refObj;
        }
    };

    stateManager.handleRef(refObj);
    return refObj;
}
