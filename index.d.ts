type ArrayIndexes<T extends any[], U extends any[] = []> =
    | U['length']
    | ([...U, any]['length'] extends T['length'] ? never : ArrayIndexes<T, [...U, any]>);

type ValueOrReturnValue<T> = T extends (...args: any) => any ? ReturnType<T> : T;

type MapToValueOrReturnValue<T extends readonly any[], U extends any[] = []> = T extends readonly [infer F, ...infer R]
    ? MapToValueOrReturnValue<R, [...U, ValueOrReturnValue<F>]>
    : U;

type CbStates<T> = T extends readonly any[] ? MapToValueOrReturnValue<T> : ValueOrReturnValue<T>;

export type Class<T = any> = new (...args: any[]) => T;

export type ObjectKey = string | symbol | number;
export type ObjectType = Record<ObjectKey, any>;

export type WEEK = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type RepeatType =
    | 'EVERY_DAY'
    | 'WEEK_DAY'
    | 'WEEKEND'
    | 'WORK_DAY'
    | 'NON_WORK_DAY'
    | WEEK[]
    | ((date: DateStr, week: number) => boolean);

export type DateStr = `${'2025' | '2026' | '2027' | '2028' | '2029' | '2030'}-${string}-${string}`;

// prettier-ignore
type Hours = '00' | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' |
             '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23';

// prettier-ignore
type MinutesOrSeconds = '00' | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' |
                        '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23' |
                        '24' | '25' | '26' | '27' | '28' | '29' | '30' | '31' | '32' | '33' | '34' | '35' |
                        '36' | '37' | '38' | '39' | '40' | '41' | '42' | '43' | '44' | '45' | '46' | '47' |
                        '48' | '49' | '50' | '51' | '52' | '53' | '54' | '55' | '56' | '57' | '58' | '59';

export type TimeStr = `${Hours}:${MinutesOrSeconds}:${MinutesOrSeconds}`;

export interface SunInfo {
    dawn: TimeStr;
    dusk: TimeStr;
    goldenHour: TimeStr;
    goldenHourEnd: TimeStr;
    nadir: TimeStr;
    nauticalDawn: TimeStr;
    nauticalDusk: TimeStr;
    night: TimeStr;
    nightEnd: TimeStr;
    solarNoon: TimeStr;
    sunrise: TimeStr;
    sunriseEnd: TimeStr;
    sunset: TimeStr;
    sunsetStart: TimeStr;
}

export interface HAEvent<A = any, S = any> {
    a: A;
    c: string;
    lc: number;
    s: S;
}

export interface Ref<T = any> {
    value: T;
    trigger: () => void;
    asPersistent: (key: string) => Ref<T>;
}

export interface DeviceDef {
    $entityIds: Record<string, string>;
    $onEvent(haEvent: HAEvent, entityId: string): void;
}

export interface CallInfo {
    entityId: string;
    service: string;
    serviceData?: Record<string, any>;
}

export type CallInfoGetter = (value: any) => CallInfo | Promise<CallInfo>;

export interface NotificationInfo {
    entityId: string;
    content: string;
}

export function Device(): ClassDecorator;

export function State(callInfoGetter?: CallInfoGetter): PropertyDecorator;

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

export function onDetect<T>(
    statesGetter: () => T,
    cb: (states: CbStates<T>, historyStates: CbStates<T>[]) => void,
    periodTime: number
): {
    pause: () => void;
    resume: () => void;
    reset: () => void;
};

export function onKeep(
    statesJudger: () => boolean,
    cb: () => void,
    keepTime?: number,
    lifeCycle?: { onMatch?: () => void; onBreak?: () => void }
): {
    stop: () => void;
    resume: () => void;
    miss: () => void;
    hit: () => void;
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

export function schedule(
    time: TimeStr | number | (TimeStr | number)[] | ((date: DateStr, week: number) => TimeStr | number | (TimeStr | number)[]),
    cb: () => void,
    repeatType?: RepeatType
);

export function ref<T>(value?: T): Ref<T>;

export function cloneDeep<T>(value: T): T;
export function isEqual(value: any, other: any): boolean;

export function isWeekDay(date?: DateStr): boolean;
export function isWeekend(date?: DateStr): boolean;
export function isWorkDay(date?: DateStr): boolean;
export function isNotWorkDay(date?: DateStr): boolean;

export function getSunInfo(date?: DateStr): SunInfo;
export function getSunriseTime(date?: DateStr): TimeStr;
export function getSunsetTime(date?: DateStr): TimeStr;

export function inTimeRange(startTime: TimeStr, endTime: TimeStr): boolean;

export function initHACoding(): Promise<void>;

export function createDevice<T extends Class<DeviceDef>>(
    deviceDef: T,
    entityIds: InstanceType<T>['$entityIds'],
    ...cps: ConstructorParameters<T>
): InstanceType<T>;

export function onStartup(cb: () => void): void;

export function call(callInfo: CallInfo): void;

export function sendNotification(notificationInfo: NotificationInfo): void;

export function customSubscribe(cb: (msgData: ObjectType) => boolean): number;

export function removeCustomSubscribe(customSubscribeId: number): void;

export function sendMsg(msg: string | ObjectType): void;

export function getGeographicLocation(): [number, number, number];
