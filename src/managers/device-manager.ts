import { Device } from '../actions/create-device.js';

export class DeviceManager {
    static #instance: DeviceManager;

    #devicesMap = new Map<string, Device>();

    private get devicesMap() {
        return this.#devicesMap;
    }

    private constructor() {}

    registerDevice(device: Device): void {
        for (const entityId of Object.keys(device.$entityIds)) {
            this.devicesMap.set(entityId, device);
        }
    }

    hasDevice(entityId: string): boolean {
        return this.devicesMap.has(entityId);
    }

    getDevice(entityId: string): Device {
        return this.devicesMap.get(entityId);
    }

    static get instance(): DeviceManager {
        if (!DeviceManager.#instance) DeviceManager.#instance = new DeviceManager();
        return DeviceManager.#instance;
    }
}
