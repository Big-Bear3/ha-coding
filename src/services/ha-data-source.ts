import type { CallInfo } from './call-service.js';
import { HAWebsocketService } from './ha-websocket-service.js';

/** Home Assistant 数据源：通过 HA WebSocket 下发 call_service */
export class HADataSource {
    static #instance: HADataSource;

    private constructor() {}

    call(callInfo: CallInfo): void {
        const haWebsocketService = HAWebsocketService.instance;
        const domain = callInfo.entityId.split('.')[0];

        haWebsocketService.send({
            id: haWebsocketService.newMsgId,
            domain,
            return_response: false,
            service: callInfo.service,
            service_data: {
                entity_id: callInfo.entityId,
                ...callInfo.serviceData
            },
            type: 'call_service'
        });
    }

    static get instance(): HADataSource {
        if (!HADataSource.#instance) HADataSource.#instance = new HADataSource();
        return HADataSource.#instance;
    }
}

