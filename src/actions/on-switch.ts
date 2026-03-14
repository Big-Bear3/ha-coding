import { onChange } from './on-change.js';

type Wildcard = '*' | '**';

export function onSwitch<T>(
    statesGetter: () => T,
    from: T | Wildcard,
    to: T | Wildcard,
    cb: (states: T, oldStates: T) => void
) {
    return onChange(statesGetter, (newVal: T, oldVal: T) => {
        const fromMatched = from === '**'
            ? true
            : from === '*'
                ? (to !== '*' && to !== '**' ? oldVal !== to : true)
                : oldVal === from;

        const toMatched = to === '**'
            ? true
            : to === '*'
                ? (from !== '*' && from !== '**' ? newVal !== from : true)
                : newVal === to;

        if (fromMatched && toMatched) {
            cb(newVal, oldVal);
        }
    });
}
