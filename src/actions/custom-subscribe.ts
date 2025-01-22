import type { ObjectType } from '../types/types';

export const customSubscribers = new Map<number, (msgData: ObjectType) => boolean>();
let customSubscribeId = 0;

export function customSubscribe(cb: (msgData: ObjectType) => boolean): number {
    customSubscribers.set(++customSubscribeId, cb);
    return customSubscribeId;
}

export function removeCustomSubscribe(customSubscribeId: number): void {
    customSubscribers.delete(customSubscribeId);
}
