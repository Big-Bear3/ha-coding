import dayjs from 'dayjs';
import type { DateStr, RepeatType, TimeStr } from '../types/types';
import { isWeekDay, isWeekend, isWorkDay, isNotWorkDay } from '../utils/app-utils.js';
import { timeStrToTimeMillis } from '../utils/date-time-utils.js';

interface ScheduleTask {
    taskId: number;
    time: TimeStr | TimeStr[] | ((date: DateStr, week: number) => TimeStr | TimeStr[]);
    cb: () => void;
    repeatType: RepeatType;
    isValid: boolean;
}

class Schedule {
    static #instance: Schedule;

    /** setTimeout每24小时，最多比系统时间提前的时间 */
    static clockMaxFastTime = 30000;

    #scheduleTasks: ScheduleTask[] = [];

    #currentTaskId = 0;

    get newTaskId() {
        return ++this.#currentTaskId;
    }

    get currentDayStartTime() {
        return dayjs().startOf('day').valueOf();
    }

    get tomorrowStartTime() {
        return dayjs().add(1, 'day').startOf('day').valueOf();
    }

    get currentDateStr() {
        return dayjs().format('YYYY-MM-DD') as DateStr;
    }

    get currentDayOfWeek() {
        return dayjs().day();
    }

    private constructor() {
        const tomorrowStartTimeDistance = this.tomorrowStartTime - new Date().getTime();
        const prepareTimeDistance = tomorrowStartTimeDistance - Schedule.clockMaxFastTime;

        if (prepareTimeDistance < 0) {
            setTimeout(() => {
                this.prepareAtMidnight(this.tomorrowStartTime);
            }, 24 * 60 * 60 * 1000 + prepareTimeDistance);
        } else {
            setTimeout(() => {
                this.prepareAtMidnight(this.tomorrowStartTime);
            }, prepareTimeDistance);
        }
    }

    prepareAtMidnight(tomorrowStartTime: number): void {
        const tomorrowStartTimeDistance = this.tomorrowStartTime - new Date().getTime();

        setTimeout(() => {
            setTimeout(() => {
                this.prepareAtMidnight(this.tomorrowStartTime);
            }, 24 * 60 * 60 * 1000 - Schedule.clockMaxFastTime);

            for (const task of this.#scheduleTasks) {
                this.handleTask(task, tomorrowStartTime);
            }
        }, tomorrowStartTimeDistance);
    }

    addTask(time: ScheduleTask['time'], cb: () => void, repeatType: RepeatType = 'EVERY_DAY'): number {
        const taskId = this.newTaskId;

        const task: ScheduleTask = {
            taskId,
            time,
            cb,
            repeatType,
            isValid: true
        };

        this.#scheduleTasks.push(task);

        if (new Date().getTime() > this.currentDayStartTime + 1000) this.handleTask(task);

        return taskId;
    }

    handleTask(task: ScheduleTask, now?: number): void {
        if (typeof task.repeatType === 'string') {
            switch (task.repeatType) {
                case 'EVERY_DAY':
                    break;

                case 'WEEK_DAY':
                    if (!isWeekDay()) return;
                    break;

                case 'WEEKEND':
                    if (!isWeekend()) return;
                    break;

                case 'WORK_DAY':
                    if (!isWorkDay()) return;
                    break;

                case 'NON_WORK_DAY':
                    if (!isNotWorkDay()) return;
                    break;
            }
        } else if (Array.isArray(task.repeatType)) {
            const currentDayOfWeek = this.currentDayOfWeek;

            switch (currentDayOfWeek) {
                case 0:
                    if (!task.repeatType.includes('SUN')) return;
                    break;

                case 1:
                    if (!task.repeatType.includes('MON')) return;
                    break;

                case 2:
                    if (!task.repeatType.includes('THU')) return;
                    break;

                case 3:
                    if (!task.repeatType.includes('WED')) return;
                    break;

                case 4:
                    if (!task.repeatType.includes('THU')) return;
                    break;

                case 5:
                    if (!task.repeatType.includes('FRI')) return;
                    break;

                case 6:
                    if (!task.repeatType.includes('SAT')) return;
                    break;
            }
        } else if (typeof task.repeatType === 'function') {
            if (!task.repeatType(this.currentDateStr, this.currentDayOfWeek)) return;
        }

        let taskTime = typeof task.time === 'function' ? task.time(this.currentDateStr, this.currentDayOfWeek) : task.time;

        if (!Array.isArray(taskTime)) {
            taskTime = [taskTime];
        }

        for (const taskTimeItem of taskTime) {
            const delayTime = this.getDelayTime(taskTimeItem, now ?? new Date().getTime());

            if (delayTime < 0) continue;

            if (delayTime < Schedule.clockMaxFastTime + 10000) {
                setTimeout(() => {
                    if (task.isValid) task.cb();
                }, delayTime);
            } else {
                setTimeout(() => {
                    const innerDelayTime = this.getDelayTime(taskTimeItem, new Date().getTime());

                    setTimeout(() => {
                        if (task.isValid) task.cb();
                    }, innerDelayTime);
                }, delayTime - Schedule.clockMaxFastTime);
            }
        }
    }

    getDelayTime(time: TimeStr, from: number): number {
        return timeStrToTimeMillis(time) - (from - this.currentDayStartTime);
    }

    pauseTask(taskId: number): void {
        const targetTask = this.#scheduleTasks.find((scheduleTask) => scheduleTask.taskId === taskId);
        if (targetTask) targetTask.isValid = false;
    }

    resumeTask(taskId: number): void {
        const targetTask = this.#scheduleTasks.find((scheduleTask) => scheduleTask.taskId === taskId);
        if (targetTask) targetTask.isValid = true;
    }

    static get instance(): Schedule {
        if (!Schedule.#instance) Schedule.#instance = new Schedule();
        return Schedule.#instance;
    }
}

export function schedule(time: ScheduleTask['time'], cb: () => void, repeatType: RepeatType = 'EVERY_DAY') {
    const schedule = Schedule.instance;
    const taskId = schedule.addTask(time, cb, repeatType);

    return {
        pause: () => {
            schedule.pauseTask(taskId);
        },
        resume: () => {
            schedule.resumeTask(taskId);
        }
    };
}
