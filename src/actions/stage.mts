function stage(...steps: Parameters<typeof onChange>[]) {
    let currentStepIndex: number;
    const onChangeOperations: ReturnType<typeof onChange>[] = [];
    let waitingTimeout: NodeJS.Timeout;

    const goto = (stepIndex: number, waitingTime?: number) => {
        clearTimeout(waitingTimeout);
        if (stepIndex > 0 && waitingTime > 0) {
            waitingTimeout = setTimeout(() => {
                reset();
            }, waitingTime);
        }

        if (stepIndex === currentStepIndex) return;
        if (stepIndex > steps.length - 1 || stepIndex < 0) {
            currentStepIndex = 0;
            return;
        }

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

    const next = (waitingTime?: number) => goto(++currentStepIndex, waitingTime);

    const prev = (waitingTime?: number) => goto(--currentStepIndex, waitingTime);

    const reset = () => goto(0);

    reset();

    return { next, prev, goto, reset };
}

function step<T>(
    statesGetter: () => T,
    cb: (states: any, oldStates: any) => void,
    onChangeOptions?: {
        immediate?: boolean;
    }
) {
    return onChangeOptions ? [statesGetter, cb, onChangeOptions] : [statesGetter, cb];
}

global.stage = stage;
global.step = step;
