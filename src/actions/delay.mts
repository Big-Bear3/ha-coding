function delay(cb: () => void, time: number): () => void {
    let timeout = setTimeout(() => {
        cb();
        timeout = null;
    }, time);

    return () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };
}

global.delay = delay;
