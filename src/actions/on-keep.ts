import { nextTick } from 'process';
import { Effect, EffectManager } from '../managers/effect-manager.js';
import { setLogContext, clearLogContext } from '../services/logger-service.js';

export function onKeep(
    statesPredicate: () => boolean,
    cb: () => void,
    keepTime?: number,
    lifecycle?: { onMatch?: () => void; onBreak?: () => void }
) {
    const effectManager = EffectManager.instance;

    let timeout: NodeJS.Timeout;
    let currentEffects: Effect[];
    let observerId: number;

    const handledCb = () => {
        effectManager.track();
        const res = statesPredicate();
        currentEffects = effectManager.reap();

        if (res) {
            if (timeout) return;

            timeout = setTimeout(() => {
                setLogContext({ tag: 'onKeep' });
                cb();
                clearLogContext();
            }, keepTime ?? 0);

            if (lifecycle?.onMatch) {
                setLogContext({ tag: 'onKeep(onMatch)' });
                lifecycle.onMatch();
                clearLogContext();
            }
        } else {
            clearTimeout(timeout);
            timeout = null;

            if (lifecycle?.onBreak) {
                setLogContext({ tag: 'onKeep(onBreak)' });
                lifecycle.onBreak();
                clearLogContext();
            }
        }

        if (observerId) {
            effectManager.removeObserver(observerId);
            effectManager.addObserver(currentEffects, handledCb, observerId);
        } else {
            observerId = effectManager.addObserver(currentEffects, handledCb);
        }
    };

    nextTick(() => {
        handledCb();
    });

    return {
        stop: () => {
            clearTimeout(timeout);
            timeout = null;
            effectManager.removeObserver(observerId);
        },
        resume: () => {
            handledCb();
            effectManager.addObserver(currentEffects, handledCb, observerId);
        },
        skip: () => {
            clearTimeout(timeout);
            timeout = null;
        },
        hit: () => {
            clearTimeout(timeout);
            timeout = null;
            setLogContext({ tag: 'onKeep(hit)' });
            cb();
            clearLogContext();
        }
    };
}
