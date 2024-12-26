type ArrayIndexes<T extends any[], U extends any[] = []> =
    | U['length']
    | ([...U, any]['length'] extends T['length'] ? never : ArrayIndexes<T, [...U, any]>);

type ValueOrReturnValue<T> = T extends (...args: any) => any ? ReturnType<T> : T;

type MapToValueOrReturnValue<T extends readonly any[], U extends any[] = []> = T extends readonly [infer F, ...infer R]
    ? MapToValueOrReturnValue<R, [...U, ValueOrReturnValue<F>]>
    : U;

type CbStates<T> = T extends readonly any[] ? MapToValueOrReturnValue<T> : ValueOrReturnValue<T>;

export interface Ref<T = any> {
    value: T;
    trigger: () => void;
}

export function Device(): ClassDecorator;

export function State(): PropertyDecorator;

export function Action(): MethodDecorator;

export function onChange<T>(
    statesGetter: () => T,
    cb: (states: CbStates<T>, oldStates: CbStates<T>) => void,
    onChangeOptions?: {
        immediate?: boolean;
    }
): {
    pause: () => void;
    resume: () => void;
};

export function onKeep(
    statesJudger: () => boolean,
    cb: () => void,
    keepTime?: number
): {
    stop: () => void;
    resume: () => void;
};

export function stage<T extends [ReturnType<typeof step<any>>, ReturnType<typeof step<any>>, ...ReturnType<typeof step<any>>[]]>(
    ...steps: T
): {
    next: (waitingTime?: number) => void;
    prev: (waitingTime?: number) => void;
    goto: (stepIndex: ArrayIndexes<T>) => void;
    reset: () => void;
    pause: () => void;
    resume: () => void;
};

export function step<T>(...args: Parameters<typeof onChange<T>>): Parameters<typeof onChange<T>>;

export class Timer {
    constructor();
    timing: (cb: () => void, time: number) => () => void;
    cancel: () => void;
}

export function delay(cb: () => void, time: number): () => void;

export function ref<T>(value?: T): Ref<T>;

export function cloneDeep<T>(value: T): T;

export function isEqual(value: any, other: any): boolean;
