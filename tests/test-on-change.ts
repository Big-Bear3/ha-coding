import { describe } from 'node:test';
import { MiLight } from './devices-def/mi-light.js';
import assert from 'assert';
import { onChange } from '../index.js';

describe('事件', () => {
    const light = new MiLight();

    setTimeout(() => {
        onChange(
            () => light.turnOn,
            (turnOn, oldTurnOn) => {
                assert.equal(turnOn, 333);
            }
        );

        onChange(
            () => [light.turnOn, light.turnOff] as const,
            ([turnOn, turnOff], [oldTurnOn, oldTurnOff]) => {
                if (turnOff) {
                    assert.equal(turnOn, undefined);
                    assert.equal(turnOff, '张3');
                } else {
                    assert.equal(turnOn, 333);
                }
            }
        );

        light.turnOn(333);
        light.turnOff('张', 3);
    }, 1);
});
