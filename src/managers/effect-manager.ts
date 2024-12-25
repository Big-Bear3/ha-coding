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

    static #observerId = 1;

    readonly #effectsToObserver = new Map<Effect[], ObserverInfo>();

    readonly #observerIdToEffects = new Map<number, Effect[]>();

    readonly #currentEffectValues = new Map<ObjectType, Map<ObjectKey, EffectValue>>();

    #currentTrackingEffects: Effect[] = [];

    #isTracking = false;

    get newObserverId(): number {
        return EffectManager.#observerId++;
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
        const oldSize = this.#currentEffectValues.size;

        let targetInstanceToEffectValue = this.#currentEffectValues.get(effectValue.effect.instance);
        if (!targetInstanceToEffectValue) targetInstanceToEffectValue = new Map();
        this.#currentEffectValues.set(effectValue.effect.instance, targetInstanceToEffectValue);
        targetInstanceToEffectValue.set(effectValue.effect.state, effectValue);

        if (oldSize > 0) return;

        process.nextTick(() => {
            for (const [effects, observerInfo] of this.#effectsToObserver) {
                for (let i = 0; i < effects.length; i++) {
                    const targetEffectValue = this.#currentEffectValues.get(effects[i].instance)?.get(effects[i].state);
                    if (!targetEffectValue || !this.isEqualEffect(effects[i], targetEffectValue.effect)) continue;

                    observerInfo.observer();

                    break;
                }
            }
            this.#currentEffectValues.clear();
        });
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
        this.#currentTrackingEffects.push(effect);
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
