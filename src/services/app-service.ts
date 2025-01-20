import { getLoginInfo, getToken, login } from '../api/api-ha.js';
import { HAWebsocketService } from './ha-websocket-service.js';

export class AppService {
    static #instance: AppService;

    #haAccessToken: string;

    get haAccessToken() {
        return this.#haAccessToken;
    }

    private constructor() {}

    async refreshAccessToken(): Promise<string> {
        const loginInfoRes = await getLoginInfo();
        const flowId: string = loginInfoRes.flow_id;

        const loginRes = await login(flowId);
        const result: string = loginRes.result;

        const tokenRes = await getToken(result);
        const accessToken: string = tokenRes.access_token;

        this.#haAccessToken = accessToken;

        return accessToken;
    }

    static get instance(): AppService {
        if (!AppService.#instance) AppService.#instance = new AppService();
        return AppService.#instance;
    }
}

export async function initHACoding(): Promise<void> {
    const appService = AppService.instance;

    try {
        await appService.refreshAccessToken();
        await HAWebsocketService.instance.createHAWebsocket();
    } catch (error) {
        console.log(error);
    }
}
