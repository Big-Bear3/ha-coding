declare interface Ref<T = any> {
    value: T;
    trigger: () => void;
}

declare const global: typeof globalThis & {
    onChange: <T>(
        statesGetter: () => T,
        cb: (states: T, oldStates: T) => void,
        onChangeOptions?: {
            immediate?: boolean;
        }
    ) => void;

    onKeep: (statesJudger: () => boolean, cb: () => void, keepTime: number) => void;

    Timer: new (...args: any[]) => {
        timing: (cb: () => void, time: number) => () => void;
        cancel: () => void;
    };

    delay: (cb: () => void, time: number) => () => void;

    ref: <T>(value?: T) => Ref<T>;
};

declare const onChange = global.onChange;
declare const onKeep = global.onKeep;
declare const Timer = global.Timer;
declare const delay = global.delay;
declare const ref = global.ref;
