import { State } from '../decorators/state.mjs';
import { Device } from '../decorators/device.mjs';
import { Event } from '../decorators/event.mjs';

@Device()
export class MiLight {
    @State()
    status: number;

    @State()
    brightness: string;

    @State()
    colorTemperature: number;

    @Event()
    turnOn(time: number): number {
        return time;
    }

    @Event()
    turnOff(time: number, user: string): void {}
}
