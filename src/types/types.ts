export type Class<T = any> = new (...args: any[]) => T;

export type ObjectKey = string | symbol | number;
export type ObjectType = Record<ObjectKey, any>;

export interface MethodDescriptor {
    configurable: boolean;
    enumerable: boolean;
    writable: boolean;
    value: Function;
}
