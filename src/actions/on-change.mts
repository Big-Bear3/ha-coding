import { cloneDeep } from 'lodash-es';
import { EffectManager } from '../managers/effect-manager.mjs';
import { StateManager } from '../managers/state-manager.mjs';

function onChange<T>(
    statesGetter: () => T,
    cb: (states: any, oldStates: any) => void,
    onChangeOptions?: {
        immediate?: boolean;
    }
) {
    const effectManager = EffectManager.instance;
    const stateManager = StateManager.instance;
    effectManager.track();
    const originalStatesGetterRes = statesGetter();
    const effects = effectManager.reap();

    let oldStatesGetterRes = cloneDeep(originalStatesGetterRes);

    if (Array.isArray(oldStatesGetterRes)) {
        replaceActionOfStatesGetterRes(oldStatesGetterRes, true);
    } else {
        if (typeof oldStatesGetterRes === 'function') {
            const actionInfo = stateManager.getActionInfoByActionFn(oldStatesGetterRes as Function);
            if (actionInfo) oldStatesGetterRes = undefined;
        }
    }

    const handledCb = () => {
        const statesGetterRes = statesGetter();

        if (Array.isArray(statesGetterRes)) {
            const actionStateIndexes = replaceActionOfStatesGetterRes(statesGetterRes);

            cb(statesGetterRes, oldStatesGetterRes);

            oldStatesGetterRes = cloneDeep(statesGetterRes);
            for (const actionStateIndex of actionStateIndexes) {
                (oldStatesGetterRes as any[])[actionStateIndex] = undefined;
            }
        } else {
            if (typeof oldStatesGetterRes === 'function') {
                const actionInfo = stateManager.getActionInfoByActionFn(oldStatesGetterRes as Function);
                if (actionInfo) {
                    const effectValue = effectManager.getCurrentEffectValue(actionInfo.instance, actionInfo.name);
                    cb(effectValue.value, undefined);
                    oldStatesGetterRes = undefined;
                } else {
                    cb(statesGetterRes, oldStatesGetterRes);
                    oldStatesGetterRes = statesGetterRes;
                }
            } else {
                cb(statesGetterRes, oldStatesGetterRes);
                oldStatesGetterRes = cloneDeep(statesGetterRes);
            }
        }
    };

    const observerId = effectManager.addObserver(effects, handledCb);

    if (onChangeOptions?.immediate) {
        if (Array.isArray(oldStatesGetterRes)) {
            cb(oldStatesGetterRes, []);
        } else {
            cb(oldStatesGetterRes, undefined);
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

function replaceActionOfStatesGetterRes(statesGetterRes: unknown, replaceToUndefined: boolean = false): number[] {
    const effectManager = EffectManager.instance;
    const stateManager = StateManager.instance;
    const actionStateIndexes: number[] = [];
    if (Array.isArray(statesGetterRes)) {
        for (let i = 0; i < statesGetterRes.length; i++) {
            const statesGetterResItem = statesGetterRes[i];
            if (typeof statesGetterResItem !== 'function') continue;

            const actionInfo = stateManager.getActionInfoByActionFn(statesGetterRes[i] as Function);

            if (actionInfo) {
                if (replaceToUndefined) {
                    statesGetterRes[i] = undefined;
                } else {
                    const effectValues = effectManager.getCurrentEffectValue(actionInfo.instance, actionInfo.name);
                    statesGetterRes[i] = effectValues?.value;
                }

                actionStateIndexes.push(i);
            }
        }
    }

    return actionStateIndexes;
}

global.onChange = onChange;
