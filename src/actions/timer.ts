import { setLogContext, clearLogContext } from '../services/logger-service.js';

export class Timer {
    #timeout: NodeJS.Timeout;

    after(cb: () => void, time: number): () => void {
        if (this.#timeout) clearTimeout(this.#timeout);

        this.#timeout = setTimeout(() => {
            setLogContext({ tag: 'timer' });
            cb();
            clearLogContext();
            this.#timeout = null;
        }, time);

        return () => {
            this.cancel();
        };
    }

    cancel() {
        clearTimeout(this.#timeout);
        this.#timeout = null;
    }
}
