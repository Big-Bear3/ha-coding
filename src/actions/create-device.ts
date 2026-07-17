import type { Class, DeviceDef, ExternalDeviceDef } from '../types/types';
import { DeviceManager } from '../managers/device-manager.js';

export type Device<T = {}> = DeviceDef & T;
export type ExternalDevice<T = {}> = ExternalDeviceDef & T;

export function createExternalDevice<T extends Class<ExternalDeviceDef>>(
    deviceDef: T,
    ...cps: ConstructorParameters<T>
): InstanceType<T> {
    const device = new deviceDef(...cps);
    DeviceManager.instance.registerExternalDevice(device);
    return device as InstanceType<T>;
}

export function createDevice<T extends Class<DeviceDef>>(
    deviceDef: T,
    entityIds: InstanceType<T>['$entityIds'],
    ...cps: ConstructorParameters<T>
): InstanceType<T> {
    const device = new deviceDef(...cps);
    device.$entityIds = entityIds;
    DeviceManager.instance.registerDevice(device);
    return device as InstanceType<T>;
}
