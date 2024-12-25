export class Timer {
    #timeout: NodeJS.Timeout;

    timing(cb: () => void, time: number): () => void {
        if (this.#timeout) clearTimeout(this.#timeout);

        this.#timeout = setTimeout(() => {
            cb();
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
