import { EffectManager } from '../managers/effect-manager.mjs';

function onKeep(statesJudger: () => boolean, cb: () => void, keepTime: number) {
    const effectManager = EffectManager.instance;
    effectManager.track();
    statesJudger();
    const effects = effectManager.reap();

    let timeout: NodeJS.Timeout;

    effectManager.addObserver(effects, () => {
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
    });
}

global.onKeep = onKeep;
