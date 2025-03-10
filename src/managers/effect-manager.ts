import type { Class, ObjectKey, ObjectType } from '../types/types';

export interface Effect {
    c?: Class;
    instance: ObjectType;
    state: ObjectKey;
    stateType: 'state' | 'ref' | 'action';
}

export interface EffectValue {
    effect: Effect;
    value?: unknown;
    oldValue?: unknown;
}

export interface ObserverInfo {
    id: number;
    observer: () => void;
}

export class EffectManager {
    static #instance: EffectManager;

    static #currentObserverId = 0;

    readonly #effectsToObserver = new Map<Effect[], ObserverInfo>();

    readonly #observerIdToEffects = new Map<number, Effect[]>();

    #todoEffectValues = new Map<ObjectType, Map<ObjectKey, EffectValue>>();

    #currentEffectValues = new Map<ObjectType, Map<ObjectKey, EffectValue>>();

    #currentTrackingEffects: Effect[] = [];

    #isTracking = false;

    private get newObserverId(): number {
        return ++EffectManager.#currentObserverId;
    }

    private constructor() {}

    addObserver(effects: Effect[], observer: ObserverInfo['observer'], observerId?: number): number {
        if (observerId && this.#observerIdToEffects.has(observerId)) return observerId;

        const targetObserverId = observerId ?? this.newObserverId;
        this.#effectsToObserver.set(effects, { id: targetObserverId, observer });
        this.#observerIdToEffects.set(targetObserverId, effects);

        return targetObserverId;
    }

    removeObserver(observerId: number): void {
        const targetEffects = this.#observerIdToEffects.get(observerId);
        if (targetEffects) this.#effectsToObserver.delete(targetEffects);
        this.#observerIdToEffects.delete(observerId);
    }

    broadcast(effectValue: EffectValue): void {
        const oldSize = this.#todoEffectValues.size;

        let targetInstanceToEffectValue = this.#todoEffectValues.get(effectValue.effect.instance);
        if (!targetInstanceToEffectValue) targetInstanceToEffectValue = new Map();
        this.#todoEffectValues.set(effectValue.effect.instance, targetInstanceToEffectValue);
        targetInstanceToEffectValue.set(effectValue.effect.state, effectValue);

        if (oldSize > 0) return;

        setTimeout(() => {
            this.#currentEffectValues = this.#todoEffectValues;
            this.#todoEffectValues = new Map();

            const targetObserverInfos: ObserverInfo[] = [];
            for (const [effects, observerInfo] of this.#effectsToObserver) {
                for (const effect of effects) {
                    const targetEffectValue = this.#currentEffectValues.get(effect.instance)?.get(effect.state);
                    if (!targetEffectValue || !this.isEqualEffect(effect, targetEffectValue.effect)) continue;
                    targetObserverInfos.push(observerInfo);
                    break;
                }
            }

            for (const targetObserverInfo of targetObserverInfos) {
                try {
                    targetObserverInfo.observer();
                } catch (error) {
                    console.error(error);
                }
            }

            this.#currentEffectValues.clear();
        }, 50);
    }

    track(): void {
        this.#currentTrackingEffects = [];
        this.#isTracking = true;
    }

    reap(): Effect[] {
        this.#isTracking = false;
        const effects = this.#currentTrackingEffects;
        this.#currentTrackingEffects = [];
        return effects;
    }

    setEffects(effect: Effect): void {
        if (!this.#isTracking) return;
        if (this.#currentTrackingEffects.every((currentTrackingEffect) => !this.isEqualEffect(currentTrackingEffect, effect))) {
            this.#currentTrackingEffects.push(effect);
        }
    }

    getCurrentEffectValue(instance: ObjectType, state: ObjectKey): EffectValue {
        return this.#currentEffectValues.get(instance)?.get(state);
    }

    private isEqualEffect(effect1: Effect, effect2: Effect): boolean {
        return effect1.instance === effect2.instance && effect1.state === effect2.state;
    }

    static get instance(): EffectManager {
        if (!EffectManager.#instance) EffectManager.#instance = new EffectManager();
        return EffectManager.#instance;
    }
}
