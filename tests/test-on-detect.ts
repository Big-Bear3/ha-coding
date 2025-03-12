import { describe } from 'node:test';
import { MiLight } from './devices-def/mi-light.js';
import { onDetect } from '../index.js';
import assert from 'assert';

describe('事件', () => {
    const light = new MiLight();

    setTimeout(() => {
        let brightness: string;
        let historyBrightness: string[];

        let colorTemperature: number;
        let historyColorTemperature: number[];

        onDetect(
            () => light.brightness,
            (value, history) => {
                brightness = value;
                historyBrightness = history;
            },
            400
        );

        onDetect(
            () => light.colorTemperature,
            (value, history) => {
                colorTemperature = value;
                historyColorTemperature = history;
            },
            400
        );

        setTimeout(() => {
            light.brightness = '88';

            setTimeout(() => {
                assert.strictEqual(brightness, '88');
                assert.strictEqual(historyBrightness.length, 0);
            }, 10);
        }, 500);

        setTimeout(() => {
            light.colorTemperature = 10;

            setTimeout(() => {
                assert.strictEqual(historyColorTemperature.length, 1);
            }, 10);
        }, 100);

        setTimeout(() => {
            light.colorTemperature = 20;

            setTimeout(() => {
                assert.strictEqual(historyColorTemperature.length, 1);
            }, 10);
        }, 450);

        setTimeout(() => {
            light.colorTemperature = 30;

            setTimeout(() => {
                assert.strictEqual(light.colorTemperature, 30);
                assert.strictEqual(historyColorTemperature.length, 2);
            }, 10);
        }, 500);
    }, 100);
});
