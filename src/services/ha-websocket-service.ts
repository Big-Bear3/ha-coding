import WebSocket from 'ws';
import type { ObjectType } from '../types/types';
import type { HAEvent } from '../types/ha-types';
import { GEOGRAPHIC_LOCATION, HA_WEBSOCKET_ADDRESS } from '../config/config.js';
import { AppService } from './app-service.js';
import { EventService } from './event-service.js';
import { customSubscribers } from '../actions/custom-subscribe.js';

export class HAWebsocketService {
    static #instance: HAWebsocketService;

    static #reconnectTimeoutTime = 60000;

    static #pingInterval = 29000;

    #ws: WebSocket;

    #currentMsgId = 0;

    #getConfigId: number;

    #subscribeEntitiesMsgId: number;

    #haWebsocketReady = false;

    #reconnectTimeout: NodeJS.Timeout;

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
                        this.resetReceiveMsgTimeout();

                        const msgData = JSON.parse(msg.data as string);

                        for (const [customSubscribeId, customSubscriber] of customSubscribers) {
                            try {
                                const res = customSubscriber(msgData);
                                if (res === false) return;
                            } catch (error) {
                                console.error(error);
                            }
                        }

                        switch (msgData.type) {
                            case 'auth_required':
                                await this.auth();
                                this.subscribeEntities();
                                break;

                            case 'event':
                                if (msgData.id !== this.#subscribeEntitiesMsgId) return;

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
                                    if (msgData.result?.latitude !== undefined && msgData.result?.latitude !== null) {
                                        GEOGRAPHIC_LOCATION[0] = msgData.result.latitude;
                                    }
                                    if (msgData.result?.longitude !== undefined && msgData.result?.longitude !== null) {
                                        GEOGRAPHIC_LOCATION[1] = msgData.result.longitude;
                                    }
                                    if (msgData.result?.elevation !== undefined && msgData.result?.elevation !== null) {
                                        GEOGRAPHIC_LOCATION[2] = msgData.result.elevation;
                                    }
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
        this.#subscribeEntitiesMsgId = this.newMsgId;

        const param = {
            id: this.#subscribeEntitiesMsgId,
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
        }, HAWebsocketService.#pingInterval);
    }

    private resetReceiveMsgTimeout(): void {
        clearTimeout(this.#reconnectTimeout);

        this.#reconnectTimeout = setTimeout(() => {
            this.reconnect();
        }, HAWebsocketService.#reconnectTimeoutTime);
    }

    private reconnect(): void {
        console.error('HA Coding 获取ws消息超时，正在重连...');

        try {
            this.#ws.close();
        } catch (error) {
            console.log(error);
        }

        try {
            this.createHAWebsocket();
        } catch (error) {
            console.log(error);
        }
    }

    static get instance(): HAWebsocketService {
        if (!HAWebsocketService.#instance) HAWebsocketService.#instance = new HAWebsocketService();
        return HAWebsocketService.#instance;
    }
}
