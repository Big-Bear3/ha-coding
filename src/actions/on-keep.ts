import { Effect, EffectManager } from '../managers/effect-manager.js';

export function onKeep(
    statesJudger: () => boolean,
    cb: () => void,
    keepTime?: number,
    lifeCycle?: { onMatch?: () => void; onBreak?: () => void }
) {
    const effectManager = EffectManager.instance;

    let timeout: NodeJS.Timeout;
    let currentEffects: Effect[];
    let observerId: number;

    const handledCb = () => {
        effectManager.track();
        const res = statesJudger();
        currentEffects = effectManager.reap();

        if (res) {
            if (timeout) return;

            if (lifeCycle?.onMatch) lifeCycle.onMatch();

            timeout = setTimeout(() => {
                cb();
                timeout = null;
            }, keepTime ?? 0);
        } else {
            clearTimeout(timeout);
            timeout = null;

            if (lifeCycle?.onBreak) lifeCycle.onBreak();
        }

        if (observerId) {
            effectManager.removeObserver(observerId);
            effectManager.addObserver(currentEffects, handledCb, observerId);
        } else {
            observerId = effectManager.addObserver(currentEffects, handledCb);
        }
    };

    handledCb();

    return {
        stop: () => {
            clearTimeout(timeout);
            effectManager.removeObserver(observerId);
        },
        resume: () => {
            handledCb();
            effectManager.addObserver(currentEffects, handledCb, observerId);
        }
    };
}
