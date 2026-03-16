import { onChange } from './on-change.js';

export function onDetect<T>(statesGetter: () => T, cb: (states: any, historyStates: any[]) => void, period: number) {
    let callTime = new Date().getTime();

    const historyStates: any[] = [];
    const timeouts: NodeJS.Timeout[] = [];

    const onChangeCb = (states: any, oldStates: any): void => {
        if (callTime) {
            const distanceFromCallTime = new Date().getTime() - callTime;

            if (distanceFromCallTime <= period) {
                historyStates.push(oldStates);

                const timeout = setTimeout(() => {
                    historyStates.shift();
                    timeouts.shift();
                }, period - distanceFromCallTime);
                timeouts.push(timeout);
            }

            callTime = null;
        } else {
            historyStates.push(oldStates);

            const timeout = setTimeout(() => {
                historyStates.shift();
                timeouts.shift();
            }, period);
            timeouts.push(timeout);
        }

        cb(states, historyStates);
    };

    const { pause: onChangePause, resume: onChangeResume } = onChange(statesGetter, onChangeCb, { _logTag: 'onDetect' });

    return {
        pause: () => {
            onChangePause();
        },
        resume: () => {
            onChangeResume();
        },
        reset: () => {
            historyStates.splice(0);
            for (const timeout of timeouts) {
                clearTimeout(timeout);
            }
            timeouts.splice(0);
        }
    };
}
