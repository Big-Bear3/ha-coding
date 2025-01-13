import { Device } from '../actions/create-device.js';

export class DeviceManager {
    static #instance: DeviceManager;

    #devicesMap = new Map<string, Device>();

    get devicesMap() {
        return this.#devicesMap;
    }

    private constructor() {}

    registerDevice(deviceInfo: Device): void {
        this.devicesMap.set(deviceInfo._entityId, deviceInfo);
    }

    static get instance(): DeviceManager {
        if (!DeviceManager.#instance) DeviceManager.#instance = new DeviceManager();
        return DeviceManager.#instance;
    }
}
