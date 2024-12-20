import './devices-def/index.mjs';
import './objects/index.mjs';
import './actions/index.mjs';
import { MiLight } from './devices-def/mi-light.mjs';

const light = new MiLight();

setTimeout(() => {
    // const { pause, resume } = onChange(
    //     () => [light.turnOn, light.brightness] as const,
    //     (turnOn, oldTurnOn) => {
    //         console.log(turnOn);
    //     }
    // );

    // onChange(
    //     () => [light.turnOn] as const,
    //     (turnOn, oldTurnOn) => {
    //         console.log(turnOn);
    //     }
    // );

    // onChange(
    //     () => light.turnOn,
    //     (turnOn, oldTurnOn) => {
    //         console.log(turnOn);
    //     }
    // );

    // onChange(
    //     () => [light.brightness, light.brightness] as const,
    //     (turnOn, oldTurnOn) => {
    //         console.log(turnOn);
    //     }
    // );

    // setTimeout(() => {
    //     pause();
    // }, 11);

    // setTimeout(() => {
    //     resume();
    // }, 222);

    const { goto, next } = stage(
        step(
            () => light.brightness,
            (turnOn, oldTurnOn) => {
                goto(1);
            }
        ),
        step(
            () => [light.turnOn, light.status],
            (turnOn, oldTurnOn) => {
                console.log(turnOn);
            }
        )
    );
}, 100);

setTimeout(() => {
    light.status = 5;

    setTimeout(() => {
        light.turnOn(222);
    });
}, 200);

// a.value.a = 123;
// a.trigger();

// light.status = 1;
// light.brightness = '11';

// onChange(
//     () => [light.status, light.turnOn] as const,
//     (status, oldStatus) => {
//         console.log(status, oldStatus);
//         debugger;
//     }
// );

// light.turnOn(112);

// setTimeout(() => {
//     light.turnOn(55);
// }, 300);

// setTimeout(() => {
//     light.status = 1;
// }, 1600);

// onKeep(
//     () => light.status === 1,
//     () => {
//         console.log(1111);
//     },
//     500
// );

// const a = new Timer();
// a.timing(() => {
//     console.log();
// }, 4000);

// delay(() => {
//     console.log();
// }, 1333);

// setTimeout(() => {
//     light.status = 2;
//     light.brightness = '20';
// }, 600);

// setTimeout(() => {
//     light.status = 3;
//     light.brightness = '30';
// }, 900);
