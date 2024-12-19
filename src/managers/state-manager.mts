import type { Class, MethodDescriptor, ObjectKey, ObjectType } from '../types/types';
import { EffectManager } from './effect-manager.mjs';
import { isEqual } from 'lodash-es';

interface StateInfo {
    name: ObjectKey;
    type: 'state' | 'event';
    originalEventFn?: (...args: unknown[]) => void;
}

export class StateManager {
    static #instance: StateManager;

    #classToStates = new Map<Class, Set<StateInfo>>();

    #instanceToStateValues = new WeakMap<ObjectType, Record<ObjectKey, unknown>>();

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

    handleEventState(c: Class, key: ObjectKey, eventFnDescriptor: MethodDescriptor): void {
        this.setClassState(c, {
            name: key,
            type: 'event',
            originalEventFn: eventFnDescriptor.value as StateInfo['originalEventFn']
        });
    }

    handleEventDefine(c: Class): void {
        const effectManager = EffectManager.instance;
        const stateInfos = this.#classToStates.get(c);

        for (const stateInfo of stateInfos) {
            if (stateInfo.type === 'state') continue;

            Reflect.defineProperty(c, stateInfo.name, {
                enumerable: false,
                configurable: true,
                get(): unknown {
                    effectManager.setEffects({ c, instance: this, state: stateInfo.name, stateType: 'event' });

                    return (...args: unknown[]) => {
                        stateInfo.originalEventFn.bind(this)(...args);
                        effectManager.broadcast({
                            effect: { c, instance: this, state: stateInfo.name, stateType: 'event' }
                        });
                    };
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

    static get instance(): StateManager {
        if (!StateManager.#instance) StateManager.#instance = new StateManager();
        return StateManager.#instance;
    }
}
