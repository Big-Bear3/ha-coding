import type { ObjectType } from '../types/types';
import WebSocket from 'ws';
import { HA_WEBSOCKET_ADDRESS } from '../config/config.js';
import { AppService } from './app-service.js';
import { EventService } from './event-service.js';
import { HAEvent } from '../types/ha-types';

export class HAWebsocketService {
    static #instance: HAWebsocketService;

    #ws: WebSocket;

    #currentMsgId = 100;

    readonly #subscribeMsgId = 3;

    #haWebsocketReady = false;

    get newMsgId() {
        return ++this.#currentMsgId;
    }

    private constructor() {}

    createHAWebsocket(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.#ws = new WebSocket(HA_WEBSOCKET_ADDRESS);

            this.#ws.onopen = async (): Promise<void> => {
                await this.timedAuth();

                this.subscribe();

                this.#ws.onmessage = (msg: WebSocket.MessageEvent) => {
                    const msgData = JSON.parse(msg.data as string);

                    switch (msgData.type) {
                        case 'auth_required':
                            this.send({
                                access_token: AppService.instance.haAccessToken,
                                type: 'auth'
                            });
                            break;
                        case 'event':
                            if (msgData.id !== this.#subscribeMsgId) return;

                            if (msgData.event.a && !this.#haWebsocketReady) {
                                for (const [entityId, event] of Object.entries<HAEvent>(msgData.event.a)) {
                                    EventService.instance.handleEvent(entityId, event);
                                }
                                this.#haWebsocketReady = true;
                                resolve();
                                return;
                            }

                            if (!msgData.event.c || typeof msgData.event.c !== 'object') return;

                            const entityId = Object.keys(msgData.event.c)?.[0];
                            if (!entityId) return;

                            const event: HAEvent = msgData.event.c[entityId]['+'];

                            EventService.instance.handleEvent(entityId, event);

                            break;
                    }
                };
            };
        });
    }

    send(msg: string | ObjectType): void {
        if (typeof msg === 'string') {
            this.#ws.send(msg);
        } else {
            this.#ws.send(JSON.stringify(msg));
        }
    }

    private async timedAuth(): Promise<void> {
        await AppService.instance.refreshAccessToken();
        this.send({
            access_token: AppService.instance.haAccessToken,
            type: 'auth'
        });

        setTimeout(() => {
            this.timedAuth();
        }, 29 * 60 * 1000);
    }

    private subscribe(): void {
        const param = {
            id: this.#subscribeMsgId,
            type: 'subscribe_entities'
        };

        this.send(param);
    }

    static get instance(): HAWebsocketService {
        if (!HAWebsocketService.#instance) HAWebsocketService.#instance = new HAWebsocketService();
        return HAWebsocketService.#instance;
    }
}
