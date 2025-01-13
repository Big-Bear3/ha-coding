import WebSocket from 'ws';
import { HA_WEBSOCKET_ADDRESS } from '../config/config.js';
import { AppService } from './app-service.js';
import { ObjectType } from 'src/types/types.js';

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
                if (msgData.type === 'auth_required') {
                    this.auth();
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
