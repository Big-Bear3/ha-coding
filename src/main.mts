import './devices-def/index.mjs';
import './objects/index.mjs';
import './decorators/index.mjs';
import './actions/index.mjs';
import { MiLight } from './devices-def/mi-light.mjs';

const light = new MiLight();

setTimeout(() => {
    onChange(
        () => light.turnOn,
        (turnOn, oldTurnOn) => {
            console.log(turnOn, oldTurnOn);
        }
    );
}, 100);

setTimeout(() => {
    light.turnOn(22);
}, 111);
