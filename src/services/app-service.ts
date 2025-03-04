import { startupCbs } from '../actions/life-cycle.js';
import { getLoginInfo, getToken, login } from '../api/api-ha.js';
import { HAWebsocketService } from './ha-websocket-service.js';

export class AppService {
    static #instance: AppService;

    #haAccessToken: string;

    get haAccessToken() {
        return this.#haAccessToken;
    }

    private constructor() {}

    async refreshAccessToken(): Promise<void> {
        const loginInfoRes = await getLoginInfo();
        const flowId: string = loginInfoRes.flow_id;

        const loginRes = await login(flowId);
        const result: string = loginRes.result;

        const tokenRes = await getToken(result);
        this.#haAccessToken = tokenRes.access_token;
    }

    static get instance(): AppService {
        if (!AppService.#instance) AppService.#instance = new AppService();
        return AppService.#instance;
    }
}

export async function initHACoding(): Promise<void> {
    try {
        await import('../config/config.js');
        await HAWebsocketService.instance.createHAWebsocket();

        console.log('HA Coding 启动成功！');

        for (const startupCb of startupCbs) {
            try {
                startupCb();
            } catch (error) {
                console.error(error);
            }
        }
    } catch (error) {
        console.error(error);
    }
}
