import WebSocket from 'ws';
import type { ObjectType } from '../types/types';
import type { HAEvent } from '../types/ha-types';
import { GEOGRAPHIC_LOCATION, HA_WEBSOCKET_ADDRESS, HA_WS_CONNECT_TIMEOUT } from '../config/config.js';
import { AppService } from './app-service.js';
import { EventService } from './event-service.js';
import { customSubscribers } from '../actions/custom-subscribe.js';
import { StateManager } from '../managers/state-manager.js';
import { logger } from './logger-service.js';

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

    #pingTimeout: NodeJS.Timeout;

    #lastMessageAt = 0;

    get newMsgId() {
        return ++this.#currentMsgId;
    }

    private constructor() {}

    createHAWebsocket(isReconnect?: boolean): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.#ws = new WebSocket(HA_WEBSOCKET_ADDRESS);

            this.#ws.onopen = async (): Promise<void> => {
                await this.auth();

                this.getConfig();
                this.subscribeEntities();
                this.timedPing();

                this.#ws.onmessage = async (msg: WebSocket.MessageEvent) => {
                    try {
                        this.#lastMessageAt = Date.now();
                        this.resetReceiveMsgTimeout();

                        const msgData = JSON.parse(msg.data as string);

                        for (const [customSubscribeId, customSubscriber] of customSubscribers) {
                            try {
                                const res = customSubscriber(msgData);
                                if (res === false) return;
                            } catch (error) {
                                logger.printError(error);
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
                                    if (isReconnect) StateManager.instance.pauseActionExec();

                                    for (const [entityId, event] of Object.entries<HAEvent>(msgData.event.a)) {
                                        EventService.instance.handleEvent(entityId, event);
                                    }

                                    if (isReconnect) StateManager.instance.resumeActionExec();

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
                        logger.printError(error);
                    }
                };
            };

            this.#ws.onerror = (error) => {
                reject(error);
            };

            this.#ws.onclose = () => {
                if (this.#haWebsocketReady) {
                    logger.printError('HA Coding ws连接已断开！');
                    this.#haWebsocketReady = false;
                    this.reconnect();
                }
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
        this.stopPing();
        this.#pingTimeout = setTimeout(() => {
            const param = {
                id: this.newMsgId,
                type: 'ping'
            };
            this.send(param);
            this.timedPing();
        }, HAWebsocketService.#pingInterval);
    }

    private stopPing(): void {
        clearTimeout(this.#pingTimeout);
        this.#pingTimeout = null;
    }

    private resetReceiveMsgTimeout(): void {
        clearTimeout(this.#reconnectTimeout);

        this.#reconnectTimeout = setTimeout(() => {
            logger.printError('HA Coding 获取ws消息超时！');
            this.#haWebsocketReady = false;
            this.reconnect();
        }, HAWebsocketService.#reconnectTimeoutTime);
    }

    private async reconnect(): Promise<void> {
        logger.printError('正在重连...');

        this.stopPing();
        clearTimeout(this.#reconnectTimeout);

        try {
            this.#ws.onclose = null;
            this.#ws.close();
        } catch (error) {
            logger.printError(error);
        }

        try {
            // 高负载下 createHAWebsocket 可能既不 onopen 也不 onerror（假死挂起），
            // 超时强制走失败分支，避免 await 永久阻塞且无任何重试 timer 兜底。
            await Promise.race([
                this.createHAWebsocket(true),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`重连 ${HA_WS_CONNECT_TIMEOUT / 1000} 秒超时`)), HA_WS_CONNECT_TIMEOUT)
                )
            ]);
            logger.print('重连成功！');
        } catch (error) {
            logger.printError('重连失败，将在60秒后重试！');
            logger.printError(error);

            // 超时竞态下 #ws 可能已被 createHAWebsocket 换成挂起的孤儿连接，close 掉防止泄漏
            if (this.#ws && this.#ws.readyState !== WebSocket.CLOSED) {
                this.#ws.onclose = null;
                try {
                    this.#ws.close();
                } catch {
                    /* 忽略关闭异常 */
                }
            }

            setTimeout(() => {
                this.reconnect();
            }, 60000);
        }
    }

    static get instance(): HAWebsocketService {
        if (!HAWebsocketService.#instance) HAWebsocketService.#instance = new HAWebsocketService();
        return HAWebsocketService.#instance;
    }

    /**
     * HA ws 健康状态，供外部健康检查使用。
     * ready：订阅是否就绪；lastMessageAt：最近一条消息时间戳（ms，含 ping/pong，健康时 29s 内必有更新；0=从未收到）。
     */
    static getHaWsHealth(): { ready: boolean; lastMessageAt: number } {
        const inst = HAWebsocketService.instance;
        return { ready: inst.#haWebsocketReady, lastMessageAt: inst.#lastMessageAt };
    }
}
