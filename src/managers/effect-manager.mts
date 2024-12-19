import type { Class, ObjectKey, ObjectType } from '../types/types';

export interface Effect {
    c?: Class;
    instance: ObjectType;
    state: ObjectKey;
    stateType: 'state' | 'ref' | 'event';
}

export interface EffectValue {
    effect: Effect;
    value?: unknown;
    oldValue?: unknown;
}

export interface ObserverInfo {
    id: number;
    observer: (states: any, oldStates: any) => void;
}

export class EffectManager {
    static #instance: EffectManager;

    static #observerId = 1;

    #effectsToObserver = new Map<Effect[], ObserverInfo>();

    #currentEffectValues = new Map<ObjectType, Map<ObjectKey, EffectValue>>();

    #currentTrackingEffects: Effect[] = [];

    #isTracking = false;

    get newObserverId() {
        return EffectManager.#observerId++;
    }

    private constructor() {}

    addObserver(effects: Effect[], observer: ObserverInfo['observer']): void {
        this.#effectsToObserver.set(effects, { id: this.newObserverId, observer });
    }

    broadcast(effectValue: EffectValue): void {
        const oldSize = this.#currentEffectValues.size;

        let targetInstance = this.#currentEffectValues.get(effectValue.effect.instance);
        if (!targetInstance) targetInstance = new Map();
        this.#currentEffectValues.set(effectValue.effect.instance, targetInstance);
        targetInstance.set(effectValue.effect.state, effectValue);

        if (oldSize > 0) return;

        process.nextTick(() => {
            for (const [effects, observerInfo] of this.#effectsToObserver) {
                for (let i = 0; i < effects.length; i++) {
                    const targetEffectValue = this.#currentEffectValues.get(effects[i].instance)?.get(effects[i].state);
                    if (!targetEffectValue || !this.isEqualEffect(effects[i], targetEffectValue.effect)) continue;

                    const stateValues: unknown[] = [];
                    const oldStateValues: unknown[] = [];
                    for (let j = 0; j < effects.length; j++) {
                        const targetStateValue =
                            effects[j].stateType === 'state' || effects[j].stateType === 'ref'
                                ? effects[j].instance[effects[j].state]
                                : undefined;
                        stateValues.push(targetStateValue);

                        if (j < i) oldStateValues.push(targetStateValue);
                    }

                    oldStateValues[i] = targetEffectValue.oldValue;

                    for (let k = i + 1; k < effects.length; k++) {
                        const targetEffectValue = this.#currentEffectValues.get(effects[k].instance)?.get(effects[k].state);
                        if (targetEffectValue) {
                            oldStateValues.push(targetEffectValue.oldValue);
                        } else {
                            oldStateValues.push(
                                effects[k].stateType === 'state' || effects[k].stateType === 'ref'
                                    ? effects[k].instance[effects[k].state]
                                    : undefined
                            );
                        }
                    }

                    if (stateValues.length === 1) {
                        observerInfo.observer(stateValues[0], oldStateValues[0]);
                    } else {
                        observerInfo.observer(stateValues, oldStateValues);
                    }

                    break;
                }
            }

            this.#currentEffectValues.clear();
        });
    }

    track(): void {
        this.#isTracking = true;
    }

    reap(): Effect[] {
        return this.#currentTrackingEffects.splice(0);
    }

    setEffects(effect: Effect): void {
        if (!this.#isTracking) return;
        this.#currentTrackingEffects.push(effect);
    }

    private isEqualEffect(effect1: Effect, effect2: Effect): boolean {
        return effect1.instance === effect2.instance && effect1.state === effect2.state;
    }

    static get instance(): EffectManager {
        if (!EffectManager.#instance) EffectManager.#instance = new EffectManager();
        return EffectManager.#instance;
    }
}
