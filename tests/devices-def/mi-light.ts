import { Action } from '../../src/decorators/action.js';
import { Device } from '../../src/decorators/device.js';
import { State } from '../../src/decorators/state.js';
import { ref } from '../../src/objects/ref.js';

@Device()
export class MiLight {
    @State(() => {
        return null;
    })
    status: number;

    @State(() => {
        return null;
    })
    brightness: string;

    @State(() => {
        return null;
    })
    colorTemperature = 4000;

    @State(() => {
        return null;
    })
    gradient = {
        on: 1000,
        off: 1500
    };

    @State(() => {
        return null;
    })
    color = ref('red');

    @Action()
    turnOn(time: number): number {
        return time;
    }

    @Action()
    turnOff(userName: string, userId: number): string {
        return userName + '-' + JSON.stringify(userId);
    }

    toggle(time: number): number {
        return time;
    }
}
