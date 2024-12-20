import { EffectManager } from '../managers/effect-manager.mjs';

function onChange<T>(
    statesGetter: () => T,
    cb: (states: any, oldStates: any) => void,
    onChangeOptions?: {
        immediate?: boolean;
    }
) {
    const effectManager = EffectManager.instance;
    effectManager.track();
    statesGetter();
    const effects = effectManager.reap();
    const observerId = effectManager.addObserver(effects, cb);

    if (onChangeOptions?.immediate) {
        const stateValues: unknown[] = [];
        for (let i = 0; i < effects.length; i++) {
            stateValues.push(effects[i].instance[effects[i].state]);
        }

        if (stateValues.length === 1) {
            cb(stateValues[0], undefined);
        } else {
            cb(stateValues, []);
        }
    }

    return {
        pause: () => {
            effectManager.removeObserver(observerId);
        },
        resume: () => {
            effectManager.addObserver(effects, cb, observerId);
        }
    };
}

global.onChange = onChange;
