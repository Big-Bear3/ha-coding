import type { HAEvent } from './ha-types';

export type Class<T = any> = new (...args: any[]) => T;

export type ObjectKey = string | symbol | number;
export type ObjectType = Record<ObjectKey, any>;

export interface MethodDescriptor {
    configurable: boolean;
    enumerable: boolean;
    writable: boolean;
    value: Function;
}

export interface DeviceDef {
    $entityIds: Record<string, string>;
    $onEvent(haEvent: HAEvent, entityId: string): void;
}

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
