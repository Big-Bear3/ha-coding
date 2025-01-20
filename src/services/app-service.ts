import { getLoginInfo, getToken, login } from '../api/api-ha.js';
import { HAWebsocketService } from './ha-websocket-service.js';

export class AppService {
    static #instance: AppService;

    #haAccessToken: string;

    #loginResult: string;

    get haAccessToken() {
        return this.#haAccessToken;
    }

    private constructor() {}

    async login(): Promise<void> {
        const loginInfoRes = await getLoginInfo();
        const flowId: string = loginInfoRes.flow_id;

        const loginRes = await login(flowId);
        this.#loginResult = loginRes.result;
    }

    async refreshAccessToken(): Promise<void> {
        const tokenRes = await getToken(this.#loginResult);
        this.#haAccessToken = tokenRes.access_token;
    }

    static get instance(): AppService {
        if (!AppService.#instance) AppService.#instance = new AppService();
        return AppService.#instance;
    }
}

export async function initHACoding(): Promise<void> {
    const appService = AppService.instance;

    try {
        await appService.login();
        await HAWebsocketService.instance.createHAWebsocket();
    } catch (error) {
        console.log(error);
    }
}
