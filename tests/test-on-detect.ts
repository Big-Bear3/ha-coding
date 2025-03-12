import { describe } from 'node:test';
import { MiLight } from './devices-def/mi-light.js';
import { onDetect } from '../index.js';
import assert from 'assert';

describe('事件', () => {
    const light = new MiLight();

    setTimeout(() => {
        let colorTemperature: number;
        let historyColorTemperature: number[];

        onDetect(
            () => light.colorTemperature,
            (value, history) => {
                colorTemperature = value;
                historyColorTemperature = history;
            },
            3000
        );

        setTimeout(() => {
            light.colorTemperature = 10;

            setTimeout(() => {
                assert.strictEqual(historyColorTemperature.length, 1);
            }, 100);
        }, 100);

        setTimeout(() => {
            light.colorTemperature = 20;

            setTimeout(() => {
                assert.strictEqual(historyColorTemperature.length, 2);
            }, 100);
        }, 500);

        setTimeout(() => {
            light.colorTemperature = 30;

            setTimeout(() => {
                assert.strictEqual(historyColorTemperature.length, 3);
            }, 100);
        }, 1000);

        setTimeout(() => {
            light.colorTemperature = 40;

            setTimeout(() => {
                assert.strictEqual(light.colorTemperature, 40);
                assert.strictEqual(historyColorTemperature.length, 3);
            }, 100);
        }, 3220);
    }, 100);
});
