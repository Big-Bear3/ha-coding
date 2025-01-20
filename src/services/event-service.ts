import { DeviceManager } from '../managers/device-manager.js';
import { HAEvent } from '../types/ha-types';
import { CallService } from './call-service.js';

export class EventService {
    static #instance: EventService;

    private constructor() {}

    handleEvent(entityId: string, event: HAEvent): void {
        try {
            const deviceManager = DeviceManager.instance;
            const device = deviceManager.getDevice(entityId);
            if (!device) return;

            const callService = CallService.instance;
            callService.callable = false;
            device.$onEvent(event, entityId);
            callService.callable = true;
        } catch (error) {
            console.error(error);
        }
    }

    static get instance(): EventService {
        if (!EventService.#instance) EventService.#instance = new EventService();
        return EventService.#instance;
    }
}
