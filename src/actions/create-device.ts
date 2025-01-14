import { DeviceManager } from '../managers/device-manager.js';
import { Class, DeviceDef, ObjectType } from '../types/types';

export type Device<T = {}> = DeviceDef & {
    _entityId: string;
} & T;

export function createDevice<T extends DeviceDef>(deviceDef: Class<T>, entityId: string): Device<T> {
    const device = new deviceDef();
    (device as any)._entityId = entityId;
    DeviceManager.instance.registerDevice(device as any);
    return device as Device<T>;
}
