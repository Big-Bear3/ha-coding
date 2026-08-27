import { startupCbs } from '../actions/life-cycle.js';
import { getLoginInfo, getToken, login } from '../api/api-ha.js';
import { HA_WS_CONNECT_TIMEOUT } from '../config/config.js';
import { HAWebsocketService } from './ha-websocket-service.js';
import { logger } from './logger-service.js';

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
    let attempt = 0;

    while (true) {
        try {
            await import('../config/config.js');

            await HAWebsocketService.instance.createHAWebsocket();

            logger.print(attempt === 0 ? 'HA Coding 启动成功！' : `HA Coding 启动成功！(重试 ${attempt} 次后)`);

            for (const startupCb of startupCbs) {
                try {
                    startupCb();
                } catch (error) {
                    logger.printError(error);
                }
            }

            return;
        } catch (error) {
            attempt++;
            logger.printError(`HA Coding 初始化失败(HA 可能未就绪)，${HA_WS_CONNECT_TIMEOUT / 1000} 秒后重试(${attempt}):`);
            logger.printError(error);
            await new Promise((resolve) => setTimeout(resolve, HA_WS_CONNECT_TIMEOUT));
        }
    }
}
