import type { Class, MethodDescriptor, ObjectKey, ObjectType } from '../types/types';
import { EffectManager } from './effect-manager.mjs';
import { cloneDeep, isEqual } from 'lodash-es';

interface StateInfo {
    name: ObjectKey;
    type: 'state' | 'action';
    originalActionFn?: (...args: unknown[]) => unknown;
}

interface ActionInfo {
    name: ObjectKey;
    instance: ObjectType;
}

export class StateManager {
    static #instance: StateManager;

    readonly #classToStates = new Map<Class, Set<StateInfo>>();

    readonly #instanceToStateValues = new WeakMap<ObjectType, Record<ObjectKey, unknown>>();

    readonly #actionFnToActionInfo = new WeakMap<Function, ActionInfo>();

    private constructor() {}

    handleState(c: Class, key: ObjectKey): void {
        const effectManager = EffectManager.instance;

        this.setClassState(c, {
            name: key,
            type: 'state'
        });

        Reflect.defineProperty(c, key, {
            enumerable: true,
            configurable: true,
            get(): unknown {
                effectManager.setEffects({ c, instance: this, state: key, stateType: 'state' });
                return StateManager.instance.getStateValue(this, key);
            },
            set(value: unknown) {
                const oldValue = this[key];

                if (isEqual(value, oldValue)) return;

                StateManager.instance.setStateValue(this, key, value);

                effectManager.broadcast({ effect: { c, instance: this, state: key, stateType: 'state' }, value, oldValue });
            }
        });
    }

    handleRef(refObj: Ref): void {
        const effectManager = EffectManager.instance;

        StateManager.instance.setStateValue(refObj, 'value', refObj.value);
        StateManager.instance.setStateValue(refObj, 'valueCopy', cloneDeep(refObj.value));

        Reflect.defineProperty(refObj, 'value', {
            enumerable: true,
            configurable: true,
            get(): unknown {
                effectManager.setEffects({ instance: refObj, state: 'value', stateType: 'ref' });
                return StateManager.instance.getStateValue(refObj, 'value');
            },
            set(value: unknown) {
                const oldValue = refObj.value;

                if (isEqual(value, oldValue)) return;

                StateManager.instance.setStateValue(refObj, 'value', value);
                StateManager.instance.setStateValue(refObj, 'valueCopy', cloneDeep(value));

                effectManager.broadcast({ effect: { instance: refObj, state: 'value', stateType: 'ref' }, value, oldValue });
            }
        });
    }

    triggerRef(refObj: Ref): void {
        const oldValue = this.getStateValue(refObj, 'valueCopy');
        EffectManager.instance.broadcast({
            effect: { instance: refObj, state: 'value', stateType: 'ref' },
            value: refObj.value,
            oldValue
        });
    }

    handleActionState(c: Class, key: ObjectKey, actionFnDescriptor: MethodDescriptor): void {
        this.setClassState(c, {
            name: key,
            type: 'action',
            originalActionFn: actionFnDescriptor.value as StateInfo['originalActionFn']
        });
    }

    handleActionDefine(c: Class): void {
        const effectManager = EffectManager.instance;
        const stateInfos = this.#classToStates.get(c);

        for (const stateInfo of stateInfos) {
            if (stateInfo.type === 'state') continue;

            Reflect.defineProperty(c, stateInfo.name, {
                enumerable: false,
                configurable: true,
                get(): unknown {
                    effectManager.setEffects({ c, instance: this, state: stateInfo.name, stateType: 'action' });

                    const actionFn = (...args: unknown[]) => {
                        const res = stateInfo.originalActionFn.bind(this)(...args);
                        effectManager.broadcast({
                            effect: { c, instance: this, state: stateInfo.name, stateType: 'action' },
                            value: res
                        });
                    };

                    StateManager.instance.#actionFnToActionInfo.set(actionFn, {
                        name: stateInfo.name,
                        instance: this
                    });

                    return actionFn;
                }
            });
        }
    }

    setClassState(c: Class, stateInfo: StateInfo): void {
        if (this.#classToStates.has(c)) {
            this.#classToStates.get(c).add(stateInfo);
        } else {
            const stateInfoSet = new Set<StateInfo>();
            stateInfoSet.add(stateInfo);
            this.#classToStates.set(c, stateInfoSet);
        }
    }

    setStateValue(instance: ObjectType, key: ObjectKey, value: unknown): void {
        const instanceToStateValues = StateManager.instance.#instanceToStateValues;
        if (instanceToStateValues.has(instance)) {
            instanceToStateValues.get(instance)[key] = value;
        } else {
            instanceToStateValues.set(instance, { [key]: value });
        }
    }

    getStateValue(instance: ObjectType, key: ObjectKey): unknown {
        return StateManager.instance.#instanceToStateValues.get(instance)?.[key];
    }

    hasState(c: Class, key: ObjectKey, stateType?: StateInfo['type']): boolean {
        const stateInfos = this.#classToStates.get(c);
        if (!stateInfos) return false;

        for (const stateInfo of stateInfos) {
            if (stateInfo.name === key) return stateType ? stateInfo.type === stateType : true;
        }
        return false;
    }

    getActionInfoByActionFn(actionFn: Function): ActionInfo {
        return this.#actionFnToActionInfo.get(actionFn);
    }

    static get instance(): StateManager {
        if (!StateManager.#instance) StateManager.#instance = new StateManager();
        return StateManager.#instance;
    }
}
