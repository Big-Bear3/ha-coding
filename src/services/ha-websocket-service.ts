import type { ObjectType } from '../types/types';
import WebSocket from 'ws';
import { GEOGRAPHIC_LOCATION, HA_WEBSOCKET_ADDRESS } from '../config/config.js';
import { AppService } from './app-service.js';
import { EventService } from './event-service.js';
import { HAEvent } from '../types/ha-types';

export class HAWebsocketService {
    static #instance: HAWebsocketService;

    #ws: WebSocket;

    #currentMsgId = 0;

    #getConfigId: number;

    #subscribeMsgId: number;

    #haWebsocketReady = false;

    get newMsgId() {
        return ++this.#currentMsgId;
    }

    private constructor() {}

    createHAWebsocket(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.#ws = new WebSocket(HA_WEBSOCKET_ADDRESS);

            this.#ws.onopen = async (): Promise<void> => {
                await this.auth();

                this.getConfig();
                this.subscribeEntities();
                this.timedPing();

                this.#ws.onmessage = async (msg: WebSocket.MessageEvent) => {
                    try {
                        const msgData = JSON.parse(msg.data as string);

                        switch (msgData.type) {
                            case 'auth_required':
                                await this.auth();
                                this.subscribeEntities();
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

                            case 'result':
                                if (msgData.id === this.#getConfigId) {
                                    GEOGRAPHIC_LOCATION[0] = msgData.result.latitude;
                                    GEOGRAPHIC_LOCATION[1] = msgData.result.longitude;
                                    GEOGRAPHIC_LOCATION[2] = msgData.result.elevation;
                                }
                        }
                    } catch (error) {
                        console.error(error);
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

    private async auth(): Promise<void> {
        await AppService.instance.refreshAccessToken();
        this.send({
            access_token: AppService.instance.haAccessToken,
            type: 'auth'
        });
    }

    private getConfig(): void {
        this.#getConfigId = this.newMsgId;

        const param = {
            id: this.#getConfigId,
            type: 'get_config'
        };

        this.send(param);
    }

    private subscribeEntities(): void {
        this.#subscribeMsgId = this.newMsgId;

        const param = {
            id: this.#subscribeMsgId,
            type: 'subscribe_entities'
        };

        this.send(param);
    }

    private timedPing(): void {
        setTimeout(() => {
            const param = {
                id: this.newMsgId,
                type: 'ping'
            };
            this.send(param);
            this.timedPing();
        }, 29000);
    }

    static get instance(): HAWebsocketService {
        if (!HAWebsocketService.#instance) HAWebsocketService.#instance = new HAWebsocketService();
        return HAWebsocketService.#instance;
    }
}
