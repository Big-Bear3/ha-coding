import dayjs from 'dayjs';
import type { DateStr, RepeatType, TimeStr } from '../types/types';
import { isWeekDay, isWeekend, isWorkDay, isNotWorkDay } from '../utils/app-utils.js';
import { timeStrToTimeMillis } from '../utils/date-time-utils.js';

interface ScheduleTask {
    taskId: number;
    time: TimeStr | number | ((date: DateStr, week: number) => TimeStr | number);
    cb: () => void;
    repeatType: RepeatType;
    isValid: boolean;
}

class Schedule {
    static #instance: Schedule;

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

    get now() {
        return new Date().getTime();
    }

    private constructor() {
        const delayTimeFromNow = this.getDelayTimeFromNow(this.tomorrowStartTime);
        setTimeout(() => {
            for (const task of this.#scheduleTasks) {
                this.handleTask(task);
            }
        }, delayTimeFromNow + 1000);
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

        if (this.now > this.currentDayStartTime + 1000) this.handleTask(task, true);

        return taskId;
    }

    handleTask(task: ScheduleTask, fromNow = false): void {
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

        const taskTime = typeof task.time === 'function' ? task.time(this.currentDateStr, this.currentDayOfWeek) : task.time;

        const delayTime = fromNow ? this.getDelayTimeFromNow(taskTime) : this.getDelayTimeFromDayStartTime(taskTime);

        if (delayTime < 0) return;

        setTimeout(() => {
            if (task.isValid) {
                task.cb();
            }
        }, delayTime);
    }

    getDelayTimeFromDayStartTime(time: TimeStr | number): number {
        if (typeof time === 'number') {
            return time - this.currentDayStartTime;
        } else {
            return timeStrToTimeMillis(time);
        }
    }

    getDelayTimeFromNow(time: TimeStr | number): number {
        if (typeof time === 'number') {
            return time - this.now;
        } else {
            return timeStrToTimeMillis(time) - this.getDelayTimeFromDayStartTime(this.now);
        }
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

export function schedule(
    time: ScheduleTask['time'] | TimeStr[] | number[],
    cb: () => void,
    repeatType: RepeatType = 'EVERY_DAY'
) {
    const schedule = Schedule.instance;

    if (Array.isArray(time)) {
        const taskIds: number[] = [];

        for (const timeItem of time) {
            const taskId = schedule.addTask(timeItem, cb, repeatType);
            taskIds.push(taskId);
        }

        return {
            pause: () => {
                for (const taskId of taskIds) {
                    schedule.pauseTask(taskId);
                }
            },
            resume: () => {
                for (const taskId of taskIds) {
                    schedule.resumeTask(taskId);
                }
            }
        };
    } else {
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
}
