import type { Ref } from '../objects/ref';
import { ref } from '../objects/ref.js';
import { Device } from '../actions/create-device.js';
import { StateManager } from './state-manager.js';

export class DeviceManager {
    static #instance: DeviceManager;

    #devicesMap = new Map<string, Device>();

    #deviceInstances = new Set<Device>();

    #unavailableEntitiesRef = ref<string[]>([]);

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

    setUnavailableEntity(entityId: string, isUnavailable: boolean): void {
        const exsitedEntityIdIndex = this.#unavailableEntitiesRef.value.indexOf(entityId);

        if (isUnavailable && exsitedEntityIdIndex === -1) {
            this.#unavailableEntitiesRef.value.push(entityId);
            this.#unavailableEntitiesRef.trigger();
        } else if (exsitedEntityIdIndex > -1) {
            this.#unavailableEntitiesRef.value.splice(exsitedEntityIdIndex, 1);
            this.#unavailableEntitiesRef.trigger();
        }
    }

    isUnavailableEntity(entityId: string): boolean {
        return this.#unavailableEntitiesRef.value.indexOf(entityId) > -1;
    }

    getUnavailableEntities(): Ref<string[]> {
        return this.#unavailableEntitiesRef;
    }

    static get instance(): DeviceManager {
        if (!DeviceManager.#instance) DeviceManager.#instance = new DeviceManager();
        return DeviceManager.#instance;
    }
}
