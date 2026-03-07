import { describe } from 'node:test';
import { MiLight } from './devices-def/mi-light.js';
import assert from 'assert';
import { onKeep, ref } from '../index.js';

describe('混合状态持续', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        const v1 = ref(0);
        onKeep(
            () => light.status && light.status > 0 && v1.value > 10,
            () => {
                assert.strictEqual(light.status, 5);
                flag++;
            },
            100
        );

        setTimeout(() => {
            light.status = 5;
            v1.value = 11;
        }, 50);

        setTimeout(() => {
            assert.strictEqual(flag, 0);
        }, 101);

        setTimeout(() => {
            assert.strictEqual(flag, 1);
        }, 169);

        setTimeout(() => {
            v1.value = 5;
        }, 170);

        setTimeout(() => {
            assert.strictEqual(flag, 1);
        }, 289);

        setTimeout(() => {
            v1.value = 15;
        }, 290);

        setTimeout(() => {
            v1.value = 9;
        }, 320);

        setTimeout(() => {
            v1.value = 16;
        }, 350);

        setTimeout(() => {
            assert.strictEqual(flag, 1);
        }, 399);

        setTimeout(() => {
            assert.strictEqual(flag, 2);
        }, 469);
    }, 100);
});

describe('停止&恢复', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        const { stop, resume } = onKeep(
            () => light.status > 2,
            () => {
                flag++;
            },
            200
        );

        light.status = 3;

        setTimeout(() => {
            assert.strictEqual(flag, 1);
            light.status = 0;
            stop();
        }, 219);

        setTimeout(() => {
            light.status = 4;
        }, 220);

        setTimeout(() => {
            resume();
        }, 400);

        setTimeout(() => {
            assert.strictEqual(flag, 1);
        }, 439);

        setTimeout(() => {
            assert.strictEqual(flag, 2);
        }, 619);
    }, 100);
});

describe('miss后应能重新触发', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        const { miss } = onKeep(
            () => light.status > 2,
            () => {
                flag++;
            },
            200
        );

        light.status = 3;

        setTimeout(() => {
            miss();
        }, 100);

        setTimeout(() => {
            light.status = 0;
        }, 150);

        setTimeout(() => {
            light.status = 4;
        }, 200);

        setTimeout(() => {
            assert.strictEqual(flag, 0);
        }, 389);

        setTimeout(() => {
            assert.strictEqual(flag, 1);
        }, 419);
    }, 700);
});

describe('hit后应能重新触发', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        const { hit } = onKeep(
            () => light.status > 2,
            () => {
                flag++;
            },
            200
        );

        light.status = 3;

        setTimeout(() => {
            hit();
            assert.strictEqual(flag, 1);
        }, 50);

        setTimeout(() => {
            light.status = 0;
        }, 100);

        setTimeout(() => {
            light.status = 4;
        }, 150);

        setTimeout(() => {
            assert.strictEqual(flag, 2);
        }, 369);
    }, 1200);
});

describe('生命周期', () => {
    const light = new MiLight();
    let matchCount = 0;
    let breakCount = 0;

    setTimeout(() => {
        onKeep(
            () => light.status > 2,
            () => {},
            200,
            {
                onMatch: () => {
                    matchCount++;
                },
                onBreak: () => {
                    breakCount++;
                }
            }
        );

        light.status = 3;

        setTimeout(() => {
            assert.strictEqual(matchCount, 1);
            assert.strictEqual(breakCount, 0);
        }, 10);

        setTimeout(() => {
            light.status = 0;
        }, 50);

        setTimeout(() => {
            assert.strictEqual(matchCount, 1);
            assert.strictEqual(breakCount, 1);
        }, 60);

        setTimeout(() => {
            light.status = 5;
        }, 100);

        setTimeout(() => {
            assert.strictEqual(matchCount, 2);
            assert.strictEqual(breakCount, 1);
        }, 110);
    }, 1800);
});
