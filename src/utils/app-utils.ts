import dayjs from 'dayjs';
import suncalc from 'suncalc';
import type { DateStr, SunInfo, TimeStr } from '../types/types';
import { cloneDeep, isEqual } from 'lodash-es';
import { EXTRA_WORK_DAYS, GEOGRAPHIC_LOCATION, HOLIDAYS } from '../config/config.js';
import { timeStrToTimeMillis } from './date-time-utils.js';

function isWeekDay(date?: DateStr): boolean {
    const dateOfWeek = date ? dayjs(date).day() : dayjs().day();
    return dateOfWeek > 0 && dateOfWeek < 6;
}

function isWeekend(date?: DateStr): boolean {
    return !isWeekDay(date);
}

function isWorkDay(date?: DateStr): boolean {
    const dateStr = date ?? dayjs().format('YYYY-MM-DD');
    return (isWeekDay() && !HOLIDAYS.includes(dateStr)) || EXTRA_WORK_DAYS.includes(dateStr);
}

function isNotWorkDay(date?: DateStr): boolean {
    return !isWorkDay(date);
}

function getSunInfo(date?: DateStr): SunInfo {
    const sunInfo: any = suncalc.getTimes(
        date ? dayjs(date).toDate() : dayjs().toDate(),
        GEOGRAPHIC_LOCATION[0],
        GEOGRAPHIC_LOCATION[1],
        GEOGRAPHIC_LOCATION[2]
    );

    for (const key of Object.keys(sunInfo)) {
        sunInfo[key] = dayjs(sunInfo[key]).format('HH:mm:ss');
    }

    return sunInfo;
}

function getSunriseTime(date?: DateStr): TimeStr {
    return getSunInfo(date).sunrise;
}

function getSunsetTime(date?: DateStr): TimeStr {
    return getSunInfo(date).sunset;
}

function inTimeRange(startTime: TimeStr, endTime: TimeStr): boolean {
    const start = timeStrToTimeMillis(startTime);
    let end = timeStrToTimeMillis(endTime);
    if (end < start) end = end + 24 * 60 * 60 * 1000;
    const currentTimeMillis = new Date().getTime() - dayjs().startOf('day').valueOf();
    return currentTimeMillis >= start && currentTimeMillis <= end;
}

export {
    cloneDeep,
    isEqual,
    isWeekDay,
    isWeekend,
    isWorkDay,
    isNotWorkDay,
    getSunInfo,
    getSunriseTime,
    getSunsetTime,
    inTimeRange
};
