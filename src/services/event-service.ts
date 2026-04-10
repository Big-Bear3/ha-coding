import type { HAEvent } from '../types/ha-types';
import { DeviceManager } from '../managers/device-manager.js';
import { CallService } from './call-service.js';
import { logger } from './logger-service.js';

export class EventService {
    static #instance: EventService;

    private constructor() {}

    handleEvent(entityId: string, event: HAEvent): void {
        try {
            const deviceManager = DeviceManager.instance;
            const device = deviceManager.getDevice(entityId);
            if (!device) return;

            const wasUnavailable = deviceManager.isUnavailableEntity(entityId);
            const isUnavailable = event?.s === 'unavailable';
            deviceManager.setUnavailableEntity(entityId, isUnavailable);
            if (isUnavailable) return;

            // 如果是 event 事件域实体，且此时是从掉线刚恢复在线，不传递给组件内部触发
            if (wasUnavailable && entityId.startsWith('event.')) return;

            const callService = CallService.instance;
            callService.callable = false;
            try {
                device.$onEvent(event, entityId);
            } finally {
                callService.callable = true;
            }
        } catch (error) {
            logger.printError(error);
        }
    }

    static get instance(): EventService {
        if (!EventService.#instance) EventService.#instance = new EventService();
        return EventService.#instance;
    }
}
