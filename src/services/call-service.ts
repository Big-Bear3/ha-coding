import { nextTick } from 'process';
import type { HACallData } from '../types/ha-types';
import { HAWebsocketService } from './ha-websocket-service.js';
import { IMMEDIATE_CALL } from '../config/config.js';

export interface CallInfo {
    entityId: string;
    service: string;
    serviceData?: Record<string, any>;
}

export type CallInfoGetter = (value: any) => CallInfo;

export class CallService {
    static #instance: CallService;

    #callingQueue: CallInfo[] = [];

    #callingIsActivated = false;

    #callable = true;

    set callable(value: boolean) {
        this.#callable = value;
    }

    get callable() {
        return this.#callable;
    }

    private constructor() {}

    push(callInfo: CallInfo): void {
        this.#callingQueue.push(callInfo);

        if (!this.#callingIsActivated) {
            this.#callingIsActivated = true;

            if (IMMEDIATE_CALL) {
                this.call();
            } else {
                nextTick(() => {
                    this.call();
                });
            }
        }
    }

    call(): void {
        try {
            const haWebsocketService = HAWebsocketService.instance;
            for (const callInfo of this.#callingQueue) {
                const callData: HACallData = {
                    id: haWebsocketService.newMsgId,
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
        } catch (error) {
            console.error(error);
        }
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
