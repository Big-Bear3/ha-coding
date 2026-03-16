import type { Ref } from '../objects/ref';
import { ref } from '../main.js';
import { Device } from '../actions/create-device.js';
import { StateManager } from './state-manager.js';
import { cloneDeep } from 'lodash-es';
import { logger } from '../services/logger-service.js';

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
            if (this.devicesMap.has(entityId)) {
                logger.printWarn('检测到了重复使用的实体ID: ' + entityId);
            }

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

        const existedEntityIdIndex = this.#unavailableEntitiesRef.value.indexOf(entityId);

        if (isUnavailable) {
            if (existedEntityIdIndex === -1) {
                const unavailableEntitiesRefClone = cloneDeep(this.#unavailableEntitiesRef.value);
                unavailableEntitiesRefClone.push(entityId);
                this.#unavailableEntitiesRef.value = unavailableEntitiesRefClone;
            }
        } else if (existedEntityIdIndex > -1) {
            const unavailableEntitiesRefClone = cloneDeep(this.#unavailableEntitiesRef.value);
            unavailableEntitiesRefClone.splice(existedEntityIdIndex, 1);
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
