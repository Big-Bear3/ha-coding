import type { Class, DeviceDef } from '../types/types';
import { DeviceManager } from '../managers/device-manager.js';

export type Device<T = {}> = DeviceDef & T;

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
