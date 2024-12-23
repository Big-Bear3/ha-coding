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
    turnOff(userName: string, userId: number): string {
        return userName + '-' + JSON.stringify(userId);
    }

    toggle(time: number): number {
        return time;
    }
}
