import { EffectManager } from '../managers/effect-manager.js';

export function onKeep(statesJudger: () => boolean, cb: () => void, keepTime: number) {
    const effectManager = EffectManager.instance;
    effectManager.track();
    statesJudger();
    const effects = effectManager.reap();

    let timeout: NodeJS.Timeout;

    const handledCb = () => {
        const res = statesJudger();
        if (res) {
            if (timeout) return;
            timeout = setTimeout(() => {
                cb();
                timeout = null;
            }, keepTime);
        } else {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    const observerId = effectManager.addObserver(effects, handledCb);

    return {
        pause: () => {
            effectManager.removeObserver(observerId);
        },
        resume: () => {
            effectManager.addObserver(effects, handledCb, observerId);
        }
    };
}
