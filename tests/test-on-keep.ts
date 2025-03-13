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
