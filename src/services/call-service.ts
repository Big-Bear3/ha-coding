import { nextTick } from 'process';
import { HACallData } from 'src/types/ha-types';
import { HAWebsocketService } from './ha-websocket-service';

export interface CallInfo {
    entityId?: string;
    service: string;
    serviceData?: Record<string, any>;
}

export type CallInfoGetter = (value: any) => CallInfo;

export class CallService {
    static #instance: CallService;

    #callingQueue: CallInfo[];

    #callingIsActivated = false;

    private constructor() {}

    push(callInfo: CallInfo): void {
        this.#callingQueue.push(callInfo);

        if (!this.#callingIsActivated) {
            this.#callingIsActivated = true;

            nextTick(() => {
                this.call();
            });
        }
    }

    call(): void {
        const haWebsocketService = HAWebsocketService.instance;
        for (const callInfo of this.#callingQueue) {
            const callData: HACallData = {
                id: haWebsocketService.msgId,
                domain: this.getDomain(callInfo.entityId),
                return_response: false,
                service: callInfo.service,
                service_data: {
                    entity_id: callInfo.entityId,
                    ...callInfo.serviceData
                },
                type: 'call_service'
            };
            haWebsocketService.send(callData);
        }
        this.#callingQueue.splice(0);
        this.#callingIsActivated = false;
    }

    private getDomain(entityId: string): string {
        if (!entityId) return undefined;

        const index = entityId.indexOf('.');
        if (index === -1) return undefined;

        return entityId.slice(0, index);
    }

    static get instance(): CallService {
        if (!CallService.#instance) CallService.#instance = new CallService();
        return CallService.#instance;
    }
}
