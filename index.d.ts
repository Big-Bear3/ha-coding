type ElementType<T> = T extends (...args: any[]) => infer R ? R : T;

type MapArray<T> = T extends readonly (infer U)[] ? ElementType<U>[] : never;

type MapTuple<T extends readonly any[]> = {
    [K in keyof T]: ElementType<T[K]>;
} & { length: T['length'] };

type CbStates<T> = T extends readonly any[]
    ? number extends T['length']
        ? MapArray<T>
        : MapTuple<T>
    : T extends (...args: any[]) => infer R
    ? R
    : T;

type ArrayIndexes<T extends any[], U extends any[] = []> =
    | U['length']
    | ([...U, any]['length'] extends T['length'] ? never : ArrayIndexes<T, [...U, any]>);

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
    /** 正午夜时间 */
    nadir: TimeStr;
    /** 夜晚结束时间 (天即将开始亮) */
    nightEnd: TimeStr;
    /** 航海黎明时间 (天开始蒙蒙亮) */
    nauticalDawn: TimeStr;
    /** 黎明时间 */
    dawn: TimeStr;
    /** 日出时间 (太阳的顶部边缘和地平线相切) */
    sunrise: TimeStr;
    /** 日出结束时间 (太阳的底部边缘和地平线相切) */
    sunriseEnd: TimeStr;
    /** 清晨金色太阳结束时间 */
    goldenHourEnd: TimeStr;
    /** 正午时间 */
    solarNoon: TimeStr;
    /** 傍晚太阳开始变成金色时间 */
    goldenHour: TimeStr;
    /** 日落开始时间 (太阳的底部边缘和地平线相切) */
    sunsetStart: TimeStr;
    /** 日落时间 (太阳的顶部边缘和地平线相切) */
    sunset: TimeStr;
    /** 黄昏时间 */
    dusk: TimeStr;
    /** 航海黄昏时间 (天基本上黑了) */
    nauticalDusk: TimeStr;
    /** 夜晚开始时间 (天已经足够暗) */
    night: TimeStr;
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
    unmergable?: boolean;
}

export type CallInfoGetter = (value: any) => CallInfo | Promise<CallInfo>;

export interface StateOptions {
    persistentKeyGetter?: ($entityIds: Record<string, string>) => string;
}

export interface NotificationInfo {
    entityId: string;
    content: string;
}

export function Device(): ClassDecorator;

export function State(): PropertyDecorator;
export function State(callInfoGetter: CallInfoGetter): PropertyDecorator;
export function State(stateOptions: StateOptions): PropertyDecorator;
export function State(callInfoGetter: CallInfoGetter, stateOptions: StateOptions): PropertyDecorator;

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
    time: TimeStr | TimeStr[] | ((date: DateStr, week: number) => TimeStr | TimeStr[]),
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

export function isUnavailableEntity(entityId: string): boolean;

export function getUnavailableEntities(): Ref<string[]>;

export function getBelongingDevice(entityId: string): DeviceDef;
