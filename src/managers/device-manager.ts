import type { Ref } from '../objects/ref';
import { ref } from '../main.js';
import type { Device, ExternalDevice } from '../actions/create-device.js';
import type { Class } from '../types/types.js';
import { StateManager } from './state-manager.js';
import { cloneDeep } from 'lodash-es';
import { logger } from '../services/logger-service.js';

export class DeviceManager {
    static #instance: DeviceManager;

    #devicesMap = new Map<string, Device>();

    #deviceInstances = new Set<Device | ExternalDevice>();

    #unavailableEntitiesRef: Ref<string[]>;

    /** 标记走小米网关直连的设备类 */
    #miGatewayDirectDeviceDefs = new Set<Class>();

    /** 直连设备类的 entityId 集合 */
    #miGatewayEntityIds = new Set<string>();

    private get devicesMap() {
        return this.#devicesMap;
    }

    private constructor() {}

    /** 注册走小米网关直连的设备类（由 @Device({ miGatewayDirect: true }) 调用） */
    registerMiGatewayDirectDeviceDef(deviceDef: Class): void {
        this.#miGatewayDirectDeviceDefs.add(deviceDef);
    }

    registerExternalDevice(device: ExternalDevice): void {
        this.registerDeviceInstance(device);
    }

    registerDevice(device: Device): void {
        this.registerDeviceInstance(device);

        const isMiGatewayDirect = this.#miGatewayDirectDeviceDefs.has(Object.getPrototypeOf(device).constructor);
        for (const entityId of Object.values(device.$entityIds)) {
            if (this.devicesMap.has(entityId)) {
                logger.printWarn('检测到了重复使用的实体ID: ' + entityId);
            }

            this.devicesMap.set(entityId, device);
            if (isMiGatewayDirect) this.#miGatewayEntityIds.add(entityId);
        }
    }

    hasDevice(entityId: string): boolean {
        return this.devicesMap.has(entityId);
    }

    hasDeviceInstance(device: Device | ExternalDevice): boolean {
        return this.#deviceInstances.has(device);
    }

    getDevice(entityId: string): Device {
        return this.devicesMap.get(entityId);
    }

    /** entityId 是否属于走小米网关直连的设备类 */
    isMiGatewayEntity(entityId: string): boolean {
        return this.#miGatewayEntityIds.has(entityId);
    }

    /** 获取所有已注册的 entityId */
    getAllEntityIds(): string[] {
        return Array.from(this.devicesMap.keys());
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

    private registerDeviceInstance(device: Device | ExternalDevice): void {
        StateManager.instance.handlePersistentStates(device);
        this.#deviceInstances.add(device);
    }

    static get instance(): DeviceManager {
        if (!DeviceManager.#instance) DeviceManager.#instance = new DeviceManager();
        return DeviceManager.#instance;
    }
}

