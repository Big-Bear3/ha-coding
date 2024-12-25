type ArrayIndexes<T extends any[], U extends any[] = []> =
    | U['length']
    | ([...U, any]['length'] extends T['length'] ? never : ArrayIndexes<T, [...U, any]>);

type ValueOrReturnValue<T> = T extends Function ? ReturnType<T> : T;

type MapToValueOrReturnValue<T extends readonly any[], U extends any[] = []> = T extends readonly [infer F, ...infer R]
    ? MapToValueOrReturnValue<R, [...U, ValueOrReturnValue<F>]>
    : U;

type CbStates<T> = T extends readonly any[] ? MapToValueOrReturnValue<T> : ValueOrReturnValue<T>;

declare interface Ref<T = any> {
    value: T;
    trigger: () => void;
}

declare const global: typeof globalThis & {
    Device: () => ClassDecorator;

    State: () => PropertyDecorator;

    Action: () => MethodDecorator;

    onChange: <T>(
        statesGetter: () => T,
        cb: (states: CbStates<readonly T>, oldStates: CbStates<readonly T>) => void,
        onChangeOptions?: {
            immediate?: boolean;
        }
    ) => {
        pause: () => void;
        resume: () => void;
    };

    onKeep: (
        statesJudger: () => boolean,
        cb: () => void,
        keepTime: number
    ) => {
        pause: () => void;
        resume: () => void;
    };

    stage: <T extends [Parameters<typeof onChange>, Parameters<typeof onChange>, ...Parameters<typeof onChange>[]]>(
        ...steps: T
    ) => {
        next: () => void;
        prev: () => void;
        goto: (stepIndex: ArrayIndexes<T>) => void;
        reset: () => void;
        pause: () => void;
        resume: () => void;
    };

    step: <T>(
        statesGetter: () => T,
        cb: (states: CbStates<readonly T>, oldStates: CbStates<readonly T>) => void,
        onChangeOptions?: {
            immediate?: boolean;
        }
    ) => Parameters<typeof step>;

    Timer: new (...args: any[]) => {
        timing: (cb: () => void, time: number) => () => void;
        cancel: () => void;
    };

    delay: (cb: () => void, time: number) => () => void;

    ref: <T>(value?: T) => Ref<T>;

    cloneDeep: <T>(value: T) => T;
    isEqual: (value: any, other: any) => boolean;
};

declare const Device = global.Device;
declare const State = global.State;
declare const Action = global.Action;
declare const onChange = global.onChange;
declare const onKeep = global.onKeep;
declare const stage = global.stage;
declare const step = global.step;
declare const Timer = global.Timer;
declare const delay = global.delay;
declare const ref = global.ref;
declare const cloneDeep = global.cloneDeep;
declare const isEqual = global.isEqual;
