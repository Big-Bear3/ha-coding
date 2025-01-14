import type { ObjectType } from '../types/types';
import WebSocket from 'ws';
import { HA_WEBSOCKET_ADDRESS } from '../config/config.js';
import { AppService } from './app-service.js';
import { EventService } from './event-service.js';
import { HAEvent } from '../types/ha-types';

export class HAWebsocketService {
    static #instance: HAWebsocketService;

    #ws: WebSocket;

    #msgId = 1;

    get msgId() {
        return this.#msgId++;
    }

    private constructor() {}

    createHAWebsocket(): void {
        this.#ws = new WebSocket(HA_WEBSOCKET_ADDRESS);

        this.#ws.onopen = (): void => {
            this.timedAuth();

            this.subscribe();

            this.#ws.onmessage = (msg: WebSocket.MessageEvent) => {
                const msgData = JSON.parse(msg.data as string);

                switch (msgData.type) {
                    case 'auth_required':
                        this.auth();
                        break;
                    case 'event':
                        if (!msgData.event.c || typeof msgData.event.c !== 'object') return;

                        const entityId = Object.keys(msgData.event.c)?.[0];
                        if (!entityId) return;

                        const event: HAEvent = msgData.event.c[entityId]['+'];

                        EventService.instance.handleEvent(entityId, event);

                        break;
                }

                console.log(msg.data);
            };
        };
    }

    send(msg: string | ObjectType): void {
        if (typeof msg === 'string') {
            this.#ws.send(msg);
        } else {
            this.#ws.send(JSON.stringify(msg));
        }
    }

    private auth(): void {
        this.send({
            access_token: AppService.instance.haAccessToken,
            type: 'auth'
        });
    }

    private timedAuth(): void {
        this.auth();
        setTimeout(() => {
            this.timedAuth();
        }, 29 * 60 * 1000);
    }

    private subscribe(): void {
        const param = {
            id: this.msgId,
            type: 'subscribe_entities'
        };

        this.send(param);
    }

    static get instance(): HAWebsocketService {
        if (!HAWebsocketService.#instance) HAWebsocketService.#instance = new HAWebsocketService();
        return HAWebsocketService.#instance;
    }
}
