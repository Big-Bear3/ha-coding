import { describe, test } from 'node:test';
import assert from 'assert';
import { Action, Device, logger, onChange } from '../index.js';

@Device()
class ActionSource {
    @Action()
    getValue(value: number): number {
        return value;
    }

    @Action()
    forwardPromise(promise: Promise<number>): Promise<number> {
        return promise;
    }

    @Action()
    fail(error: Error): Promise<never> {
        return Promise.reject(error);
    }
}

describe('@Action 返回值', () => {
    test('同步返回值会原样返回并传递给监听回调', async () => {
        const source = new ActionSource();
        let observedValue: number;

        onChange(
            () => source.getValue,
            (value) => {
                observedValue = value;
            }
        );

        assert.strictEqual(source.getValue(3), 3);
        await Promise.resolve();
        assert.strictEqual(observedValue, 3);
    });

    test('异步返回值保留原 Promise，完成后传递解包值', async () => {
        const source = new ActionSource();
        let observedValue: number;

        onChange(
            () => source.forwardPromise,
            (value) => {
                observedValue = value;
            }
        );

        const originalPromise = Promise.resolve(7);
        const returnedPromise = source.forwardPromise(originalPromise);

        assert.strictEqual(returnedPromise, originalPromise);
        assert.strictEqual(await returnedPromise, 7);
        await Promise.resolve();
        assert.strictEqual(observedValue, 7);
    });

    test('异步失败保持原拒绝结果且不触发监听', async () => {
        const source = new ActionSource();
        const expectedError = new Error('expected async action failure');
        const originalPrintError = logger.printError;
        let loggedError: unknown;
        let actionObserved = false;

        onChange(
            () => source.fail,
            () => {
                actionObserved = true;
            }
        );

        logger.printError = (error: unknown) => {
            loggedError = error;
        };

        try {
            await assert.rejects(source.fail(expectedError), expectedError);
            await Promise.resolve();
        } finally {
            logger.printError = originalPrintError;
        }

        assert.strictEqual(loggedError, expectedError);
        assert.strictEqual(actionObserved, false);
    });
});
