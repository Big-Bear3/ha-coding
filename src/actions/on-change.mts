import { EffectManager } from '../managers/effect-manager.mjs';

function onChange<T>(
    statesGetter: () => T,
    cb: (states: T, oldStates: T) => void,
    onChangeOptions?: {
        immediate?: boolean;
    }
) {
    const effectManager = EffectManager.instance;
    effectManager.track();
    statesGetter();
    const effects = effectManager.reap();
    effectManager.addObserver(effects, cb);

    if (onChangeOptions?.immediate) {
        const stateValues: unknown[] = [];
        for (let i = 0; i < effects.length; i++) {
            stateValues.push(effects[i].instance[effects[i].state]);
        }

        if (stateValues.length === 1) {
            cb(stateValues[0] as T, undefined);
        } else {
            cb(stateValues as T, [] as T);
        }
    }
}

global.onChange = onChange;
