import { StateManager } from '../managers/state-manager.mjs';

function ref<T>(value?: T): Ref<T> {
    const refObj: Ref = {
        value,
        trigger: () => {
            StateManager.instance.triggerRef(refObj);
        }
    };

    StateManager.instance.handleRef(refObj);
    return refObj;
}

global.ref = ref;
