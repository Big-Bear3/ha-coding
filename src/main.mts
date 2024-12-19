import './devices-def/index.mjs';
import './actions/index.mjs';
import { MiLight } from './devices-def/mi-light.mjs';
import { log } from 'console';

const light = new MiLight();

// onChange(
//     () => [[light.status, light.brightness]],
//     ([status, brightness], [oldStatus, oldBrightness]) => {
//         console.log(status, brightness, oldStatus, oldBrightness);
//     }
// );

// light.status = 1;
// light.brightness = '11';

// onChange(
//     () => [light.status, light.turnOn],
//     (status, oldStatus) => {
//         console.log(status, oldStatus);
//         debugger;
//     }
// );

// light.turnOn(112);

// setTimeout(() => {
//     light.turnOn(55);
// }, 300);

setTimeout(() => {
    light.status = 1;
}, 1600);

onKeep(
    () => light.status === 1,
    () => {
        console.log(1111);
    },
    500
);

const a = new Timer();
a.timing(() => {
    console.log();
}, 4000);

delay(() => {
    console.log();
}, 1333);

// setTimeout(() => {
//     light.status = 2;
//     light.brightness = '20';
// }, 600);

// setTimeout(() => {
//     light.status = 3;
//     light.brightness = '30';
// }, 900);
