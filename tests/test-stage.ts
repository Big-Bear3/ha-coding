import { describe } from 'node:test';
import { MiLight } from './devices-def/mi-light.js';
import assert from 'assert';
import { stage, step } from '../index.js';

describe('顺序发生', () => {
    const light = new MiLight();
    light.status = 1;
    let flag = 0;

    setTimeout(() => {
        const { next } = stage(
            step(
                () => light.status,
                (status) => {
                    if (status === 1) flag = 1;
                    if (status === 6) {
                        flag = 6;
                        next(20);
                    }
                    if (status === 12) {
                        flag = 100;
                    }
                },
                { immediate: true }
            ),
            step(
                () => light.status,
                (status) => {
                    if (status === 10) {
                        flag = 10;

                        setTimeout(() => {
                            next();
                        }, 2);
                    } else {
                        flag++;
                    }
                }
            )
        );

        setTimeout(() => {
            assert.strictEqual(flag, 1);
        });

        setTimeout(() => {
            light.status = 6;
        }, 1);

        setTimeout(() => {
            assert.strictEqual(flag, 6);
        }, 2);

        setTimeout(() => {
            light.status = 7;
        }, 3);

        setTimeout(() => {
            assert.strictEqual(flag, 7);
        }, 4);

        setTimeout(() => {
            light.status = 10;
        }, 5);

        setTimeout(() => {
            assert.strictEqual(flag, 10);
            light.status = 11;
        }, 6);

        setTimeout(() => {
            assert.strictEqual(flag, 11);
        }, 7);

        setTimeout(() => {
            light.status = 12;
        }, 20);

        setTimeout(() => {
            assert.strictEqual(flag, 100);
        }, 21);
    }, 1);
});
