import type { Ref } from '../objects/ref';
import { ref } from '../main.js';
import { Device } from '../actions/create-device.js';
import { StateManager } from './state-manager.js';
import { cloneDeep } from 'lodash-es';

export class DeviceManager {
    static #instance: DeviceManager;

    #devicesMap = new Map<string, Device>();

    #deviceInstances = new Set<Device>();

    #unavailableEntitiesRef: Ref<string[]>;

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
        if (!this.#unavailableEntitiesRef) this.#unavailableEntitiesRef = ref([]);

        const exsitedEntityIdIndex = this.#unavailableEntitiesRef.value.indexOf(entityId);

        if (isUnavailable) {
            if (exsitedEntityIdIndex === -1) {
                const unavailableEntitiesRefClone = cloneDeep(this.#unavailableEntitiesRef.value);
                unavailableEntitiesRefClone.push(entityId);
                this.#unavailableEntitiesRef.value = unavailableEntitiesRefClone;
            }
        } else if (exsitedEntityIdIndex > -1) {
            const unavailableEntitiesRefClone = cloneDeep(this.#unavailableEntitiesRef.value);
            unavailableEntitiesRefClone.splice(exsitedEntityIdIndex, 1);
            this.#unavailableEntitiesRef.value = unavailableEntitiesRefClone;
        }
    }

    isUnavailableEntity(entityId: string): boolean {
        if (!this.#unavailableEntitiesRef) this.#unavailableEntitiesRef = ref([]);
        return this.#unavailableEntitiesRef.value.includes(entityId);
    }

    getUnavailableEntities(): Ref<string[]> {
        if (!this.#unavailableEntitiesRef) this.#unavailableEntitiesRef = ref([]);
        return this.#unavailableEntitiesRef;
    }

    static get instance(): DeviceManager {
        if (!DeviceManager.#instance) DeviceManager.#instance = new DeviceManager();
        return DeviceManager.#instance;
    }
}
