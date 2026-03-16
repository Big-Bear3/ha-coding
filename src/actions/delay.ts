import { setLogContext, clearLogContext } from '../services/logger-service.js';

export function delay(cb: () => void, time: number): () => void {
    let timeout = setTimeout(() => {
        setLogContext({ tag: 'delay' });
        cb();
        clearLogContext();
        timeout = null;
    }, time);

    return () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };
}
