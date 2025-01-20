// import { onChange } from '../index.js';
// import { MiLight } from '../tests/devices-def/mi-light.js';

// const light = new MiLight();

// setTimeout(() => {
//     onChange(
//         () => light.turnOn,
//         (turnOn, oldTurnOn) => {
//             console.log(turnOn);
//         }
//     );

//     onChange(
//         () => [light.turnOn],
//         (turnOn, oldTurnOn) => {
//             console.log(turnOn);
//         }
//     );

//     light.turnOn(333);
//     light.turnOff('张', 3);
// }, 1);
