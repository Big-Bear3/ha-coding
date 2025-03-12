import { onChange } from './on-change.js';

export function onDetect<T>(statesGetter: () => T, cb: (states: any, historyStates: any[]) => void, periodTime: number) {
    let callTime = new Date().getTime();

    const historyStates: any[] = [];

    const onChangeCb = (states: any, oldStates: any): void => {
        if (callTime) {
            const distanceFromCallTime = new Date().getTime() - callTime;

            if (distanceFromCallTime <= periodTime) {
                historyStates.push(oldStates);

                setTimeout(() => {
                    historyStates.shift();
                }, distanceFromCallTime);
            }

            callTime = null;
        } else {
            historyStates.push(oldStates);

            setTimeout(() => {
                historyStates.shift();
            }, periodTime);
        }

        cb(states, historyStates);
    };

    const { pause: onChangePause, resume: onChangeResume } = onChange(statesGetter, onChangeCb);

    return {
        pause: () => {
            onChangePause();
        },
        resume: () => {
            onChangeResume();
        },
        reset: () => {
            historyStates.splice(0);
        }
    };
}
