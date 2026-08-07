import { startupCbs } from '../actions/life-cycle.js';
import { getLoginInfo, getToken, login } from '../api/api-ha.js';
import { HAWebsocketService } from './ha-websocket-service.js';
import { HADataSource } from './ha-data-source.js';
import { MiDataSource } from './mi/mi-data-source.js';
import { MiRouter } from './mi/mi-router.js';
import { EventService } from './event-service.js';
import { DeviceManager } from '../managers/device-manager.js';
import { MiTranslator } from './mi/mi-translator.js';
import { HA_ENABLED } from '../config/config.js';
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
    try {
        await import('../config/config.js');

        const router = MiRouter.instance;

        let haDataSource: HADataSource = null;
        let miDataSource: MiDataSource = null;

        // Home Assistant（非小米设备走 HA；未配置 HA 则跳过，纯小米直连模式）
        if (HA_ENABLED) {
            try {
                await HAWebsocketService.instance.createHAWebsocket();
                haDataSource = HADataSource.instance;
            } catch (error) {
                logger.printError('[Init] HA 连接失败');
                logger.printError(error);
            }
        } else {
            logger.print('[Init] 未配置 HA，跳过（纯小米直连模式）');
        }

        // 小米中枢网关直连（小米设备走直连；未认证或失败则回退 HA）
        try {
            await MiDataSource.instance.start((entityId, event) => {
                EventService.instance.handleEvent(entityId, event);
            });
            miDataSource = MiDataSource.instance;
        } catch (error) {
            logger.printError('[Init] 小米直连失败，小米设备回退 HA');
            logger.printError(error);
        }

        router.init(haDataSource, miDataSource);

        for (const startupCb of startupCbs) {
            try {
                startupCb();
            } catch (error) {
                logger.printError(error);
            }
        }

        // onStartup 后重新注册 direct entityId，覆盖在启动回调中注册的设备
        if (miDataSource) {
            MiTranslator.instance.registerEntities(
                DeviceManager.instance.getAllEntityIds().filter((id) => DeviceManager.instance.isMiGatewayEntity(id))
            );
            // 先拉取所有初始值，完成后再标记启动成功（#started=true）
            // 初始值就位前联动指令被 MiRouter 拦截（usesMiGateway=false），避免在部分状态上误触发
            try {
                await MiTranslator.instance.fetchInitialState((entityId, event) => {
                    EventService.instance.handleEvent(entityId, event);
                });
            } catch (error) {
                logger.printError('[Init] fetchInitialState 失败');
                logger.printError(error);
            }
            miDataSource.markStarted();
        }

        logger.print(`HA Coding 启动成功！(ha=${!!haDataSource}, mi=${miDataSource?.isStarted ?? false})`);
    } catch (error) {
        logger.printError(error);
    }
}

