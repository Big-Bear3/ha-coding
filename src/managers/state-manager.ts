import type { Ref } from '../objects/ref';
import type { Class, MethodDescriptor, ObjectKey, ObjectType } from '../types/types';
import { cloneDeep, isEqual } from 'lodash-es';
import { CallInfoGetter, CallService } from '../services/call-service.js';
import { EffectManager } from './effect-manager.js';
import { localStorage } from '../utils/local-storage.js';
import { StateOptions } from 'src/decorators/state';

interface StateInfo {
    name: ObjectKey;
    type: 'state' | 'action';
    callInfoGetter?: CallInfoGetter;
    originalActionFn?: (...args: unknown[]) => unknown;
    stateOptions?: StateOptions;
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

    readonly #refObjToPersistentKey = new WeakMap<Ref, string>();

    private constructor() {}

    handleState(c: Class, key: ObjectKey, callInfoGetter?: CallInfoGetter, stateOptions?: StateOptions): void {
        const effectManager = EffectManager.instance;

        this.setClassState(c, {
            name: key,
            type: 'state',
            callInfoGetter,
            stateOptions
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

                StateManager.instance.setStateValue(this, key, value);

                const persistentKey = stateOptions?.persistentKey;
                if (persistentKey) {
                    if (persistentKey) StateManager.instance.setPersistentValue(persistentKey, value);
                }

                const callService = CallService.instance;

                if (callService.callable && callInfoGetter) {
                    try {
                        const callInfo = callInfoGetter.bind(this)(value);
                        if (callInfo instanceof Promise) {
                            callInfo.then((callInfoValue) => {
                                if (callInfoValue) callService.push(callInfoValue);
                            });
                        } else {
                            if (callInfo) callService.push(callInfo);
                        }
                    } catch (error) {
                        console.error(error);
                    }
                }

                if (isEqual(value, oldValue)) return;

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

                const refPersistentKey = StateManager.instance.getRefPersistentKey(refObj);
                if (refPersistentKey) {
                    StateManager.instance.setPersistentValue(refPersistentKey, value);
                }

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

        for (const stateInfo of stateInfos ?? []) {
            if (stateInfo.type === 'state') continue;

            Reflect.defineProperty(c, stateInfo.name, {
                enumerable: false,
                configurable: true,
                get(): unknown {
                    effectManager.setEffects({ c, instance: this, state: stateInfo.name, stateType: 'action' });

                    const actionFn = (...args: unknown[]) => {
                        try {
                            const res = stateInfo.originalActionFn.bind(this)(...args);
                            effectManager.broadcast({
                                effect: { c, instance: this, state: stateInfo.name, stateType: 'action' },
                                value: res
                            });
                        } catch (error) {
                            console.error(error);
                        }
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

    getStateInfos(c: Class): StateInfo[] {
        const stateInfoSet = this.#classToStates.get(c);
        if (stateInfoSet) return Array.from(stateInfoSet);
        return [];
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

    setRefAsPersistent(refObj: Ref, key: string): void {
        this.#refObjToPersistentKey.set(refObj, key);
        const persistentValue = this.getPersistentValue(key);
        if (persistentValue === undefined) {
            if (refObj.value !== undefined) this.setPersistentValue(key, refObj.value);
        } else {
            refObj.value = persistentValue;
        }
    }

    getRefPersistentKey(refObj: Ref): string {
        return this.#refObjToPersistentKey.get(refObj);
    }

    setPersistentValue(key: string, value: any): void {
        try {
            const refPersistence = JSON.stringify({ value });
            localStorage.setItem(key, refPersistence);
        } catch (error) {
            console.log(error);
        }
    }

    getPersistentValue(key: string): any {
        const refPersistence = localStorage.getItem(key);

        if (!refPersistence) return undefined;

        try {
            const refPersistenceObj = JSON.parse(refPersistence);
            return refPersistenceObj.value;
        } catch (error) {
            console.log(error);
        }

        return undefined;
    }

    handlePersistentStates(deviceInstance: ObjectType): void {
        const c = Reflect.getPrototypeOf(deviceInstance) as Class;
        const stateInfos = this.getStateInfos(c);
        for (const stateInfo of stateInfos) {
            const persistentKeyGetter = stateInfo?.stateOptions?.persistentKeyGetter;
            if (!persistentKeyGetter) continue;

            const persistentKey = persistentKeyGetter.bind(deviceInstance)(deviceInstance.$entityIds);
            if (!persistentKey) continue;

            stateInfo.stateOptions.persistentKey = persistentKey;

            const persistentValue = this.getPersistentValue(persistentKey);
            if (persistentValue === undefined) {
                if (deviceInstance[stateInfo.name] !== undefined)
                    this.setPersistentValue(persistentKey, deviceInstance[stateInfo.name]);
            } else {
                deviceInstance[stateInfo.name] = persistentValue;
            }
        }
    }

    static get instance(): StateManager {
        if (!StateManager.#instance) StateManager.#instance = new StateManager();
        return StateManager.#instance;
    }
}
