import { onChange } from './on-change.js';

export function stage(...steps: Parameters<typeof onChange>[]) {
    let currentStepIndex: number;
    const onChangeOperations: ReturnType<typeof onChange>[] = [];
    let waitingTimeout: NodeJS.Timeout;

    const goto = (stepIndex: number, waitingTime?: number) => {
        if (stepIndex > steps.length - 1 || stepIndex < 0) {
            reset();
            return;
        }

        clearTimeout(waitingTimeout);
        if (stepIndex > 0 && waitingTime && waitingTime > 0) {
            waitingTimeout = setTimeout(() => {
                reset();
            }, waitingTime);
        }

        if (stepIndex === currentStepIndex) return;

        currentStepIndex = stepIndex;
        for (let i = 0; i < onChangeOperations.length; i++) {
            if (i === currentStepIndex || !onChangeOperations[i]) continue;
            onChangeOperations[i].pause();
        }

        if (onChangeOperations[currentStepIndex]) {
            onChangeOperations[currentStepIndex].resume();
        } else {
            const [statesGetter, cb, onChangeOptions] = steps[currentStepIndex];
            const { pause, resume } = onChange(statesGetter, (...args: Parameters<typeof cb>) => cb(...args), onChangeOptions);
            onChangeOperations[currentStepIndex] = { pause, resume };
        }
    };

    const next = (waitingTime?: number) => goto(currentStepIndex + 1, waitingTime);

    const prev = (waitingTime?: number) => goto(currentStepIndex - 1, waitingTime);

    const reset = () => goto(0);

    const pause = () => onChangeOperations[currentStepIndex].pause();

    const resume = () => onChangeOperations[currentStepIndex].resume();

    reset();

    return { next, prev, goto, reset, pause, resume };
}

export function step<T>(
    statesGetter: () => T,
    cb: (states: any, oldStates: any) => void,
    onChangeOptions?: {
        immediate?: boolean;
    }
) {
    return onChangeOptions ? [statesGetter, cb, onChangeOptions] : [statesGetter, cb];
}
