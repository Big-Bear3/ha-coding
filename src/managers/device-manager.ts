import type { Ref } from '../objects/ref';
import { ref } from '../objects/ref.js';
import { Device } from '../actions/create-device.js';
import { StateManager } from './state-manager.js';

export class DeviceManager {
    static #instance: DeviceManager;

    #devicesMap = new Map<string, Device>();

    #deviceInstances = new Set<Device>();

    #unavailableEntitiesMap = new Map<string, Ref<boolean>>();

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
        const unavailableRef = this.#unavailableEntitiesMap.get(entityId);

        if (isUnavailable) {
            if (unavailableRef) {
                unavailableRef.value = true;
            } else {
                this.#unavailableEntitiesMap.set(entityId, ref(true));
            }
        } else {
            if (unavailableRef) unavailableRef.value = false;
        }
    }

    isUnavailableEntity(entityId: string): boolean {
        let unavailableRef = this.#unavailableEntitiesMap.get(entityId);
        if (!unavailableRef) {
            unavailableRef = ref(false);
            this.#unavailableEntitiesMap.set(entityId, unavailableRef);
        }

        return unavailableRef.value;
    }

    getUnavailableEntities(): string[] {
        const unavailableEntities: string[] = [];

        for (const [entityId, unavailableRef] of this.#unavailableEntitiesMap) {
            if (unavailableRef.value) {
                unavailableEntities.push(entityId);
            }
        }

        return unavailableEntities;
    }

    static get instance(): DeviceManager {
        if (!DeviceManager.#instance) DeviceManager.#instance = new DeviceManager();
        return DeviceManager.#instance;
    }
}
