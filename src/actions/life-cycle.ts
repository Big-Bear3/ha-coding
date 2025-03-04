export const startupCbs: (() => void)[] = [];

export function onStartup(cb: () => void): void {
    startupCbs.push(cb);
}
