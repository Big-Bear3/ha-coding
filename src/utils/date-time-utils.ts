import type { TimeStr } from '../types/types';

/** 获取指定时间距当天开始时间的毫秒数 */
export function timeStrToTimeMillis(time: TimeStr): number {
    const timeParts = time.split(':');
    const hour = Number(timeParts[0]);
    const minute = Number(timeParts[1]);
    const second = Number(timeParts[2]);
    return (hour * 60 * 60 + minute * 60 + second) * 1000;
}
