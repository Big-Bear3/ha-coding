import { Device } from '../actions/create-device.js';
import { StateManager } from './state-manager.js';

export class DeviceManager {
    static #instance: DeviceManager;

    #devicesMap = new Map<string, Device>();

    #deviceInstances = new Set<Device>();

    private get devicesMap() {
        return this.#devicesMap;
    }

    private constructor() {}

    registerDevice(device: Device): void {
        StateManager.instance.handlePersistentStates(device);

        for (const entityId of Object.values(device.$entityIds)) {
            this.devicesMap.set(entityId, device);
        }

        this.#deviceInstances.add(device);
    }

    hasDevice(entityId: string): boolean {
        return this.devicesMap.has(entityId);
    }

    hasDeviceInstance(device: Device): boolean {
        return this.#deviceInstances.has(device);
    }

    getDevice(entityId: string): Device {
        return this.devicesMap.get(entityId);
    }

    static get instance(): DeviceManager {
        if (!DeviceManager.#instance) DeviceManager.#instance = new DeviceManager();
        return DeviceManager.#instance;
    }
}
