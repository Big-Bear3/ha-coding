import './decorators/index.mjs';
import './actions/index.mjs';
import './devices-def/index.mjs';
import './objects/index.mjs';

import { MiLight } from './devices-def/mi-light.mjs';

const light = new MiLight();
light.status = 1;
light.brightness = '223';

setTimeout(() => {
    onChange(
        () => [light.toggle, light.turnOff] as const,
        ([turnOn, turnOff], [oldTurnOn, oldTurnOff]) => {
            console.log(turnOn, turnOff, oldTurnOn, oldTurnOff);
        }
    );

    light.turnOff('张', { a: light.status, b: light.brightness } as any);
    setTimeout(() => {
        light.turnOff('张', 4);
    }, 2000);
}, 1);
