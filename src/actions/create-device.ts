import { Class, ObjectType } from '../types/types';

export type Device<T = {}> = T & {
    _entityId: string;
};

export function createDevice<T extends ObjectType>(deviceDef: Class<T>, deviceId: string): Device<T> {
    const device = new deviceDef();
    (device as any)._entityId = deviceId;
    return device as Device<T>;
}
