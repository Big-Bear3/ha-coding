import { cloneDeep } from 'lodash-es';
import { Effect, EffectManager } from '../managers/effect-manager.mjs';

function onChange<T>(
    statesGetter: () => T,
    cb: (states: any, oldStates: any) => void,
    onChangeOptions?: {
        immediate?: boolean;
    }
) {
    const effectManager = EffectManager.instance;
    effectManager.track();
    const originalStatesValue = statesGetter();
    const effects = effectManager.reap();

    let oldStatesValue = cloneDeep(originalStatesValue);

    if (Array.isArray(oldStatesValue)) {
        replaceActionOfStatesValue(oldStatesValue, true);
    } else {
        const effect = getValidActionStateEffect(statesGetter);
        if (effect) oldStatesValue = undefined;
    }

    const handledCb = () => {
        const statesValue = statesGetter();

        if (Array.isArray(statesValue)) {
            const actionStateIndexes = replaceActionOfStatesValue(statesValue);

            cb(statesValue, oldStatesValue);

            oldStatesValue = cloneDeep(statesValue);
            for (const actionStateIndex of actionStateIndexes) {
                (oldStatesValue as any[])[actionStateIndex] = undefined;
            }
        } else {
            const effect = getValidActionStateEffect(statesGetter);
            if (effect) {
                const effectValue = effectManager.getCurrentEffectValue(effect.instance, effect.state);
                cb(effectValue.value, undefined);
                oldStatesValue = undefined;
            } else {
                cb(statesValue, oldStatesValue);
                oldStatesValue = cloneDeep(statesValue);
            }
        }
    };

    const observerId = effectManager.addObserver(effects, handledCb);

    if (onChangeOptions?.immediate) {
        if (Array.isArray(oldStatesValue)) {
            cb(oldStatesValue, []);
        } else {
            cb(oldStatesValue, undefined);
        }
    }

    return {
        pause: () => {
            effectManager.removeObserver(observerId);
        },
        resume: () => {
            effectManager.addObserver(effects, handledCb, observerId);
        }
    };
}

function replaceActionOfStatesValue(statesValue: unknown, replaceToUndefined: boolean = false): number[] {
    const effectManager = EffectManager.instance;
    const actionStateIndexes: number[] = [];
    if (Array.isArray(statesValue)) {
        for (let i = 0; i < statesValue.length; i++) {
            const statesValueItem = statesValue[i];
            if (typeof statesValueItem !== 'function') continue;

            const effect = getValidActionStateEffect(() => statesValue[i]);

            if (effect) {
                if (replaceToUndefined) {
                    statesValue[i] = undefined;
                } else {
                    const effectValues = effectManager.getCurrentEffectValue(effect.instance, effect.state);
                    statesValue[i] = effectValues.value;
                }

                actionStateIndexes.push(i);
            }
        }
    }

    return actionStateIndexes;
}

function getValidActionStateEffect(stateGetter: () => unknown): Effect {
    const effectManager = EffectManager.instance;

    effectManager.track();
    const statesValue = stateGetter();
    const effects = effectManager.reap();

    if (typeof statesValue !== 'function' || effects.length !== 1) return undefined;

    return effects[0];
}

global.onChange = onChange;
