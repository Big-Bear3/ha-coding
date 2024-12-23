@Device()
export class MiLight {
    @State()
    status: number;

    @State()
    brightness: string;

    @State()
    colorTemperature: number;

    @Action()
    turnOn(time: number): number {
        return time;
    }

    @Action()
    turnOff(time: number, user: string): void {}
}
