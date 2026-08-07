import type { CallInfo } from '../call-service.js';
import { DeviceManager } from '../../managers/device-manager.js';
import { HADataSource } from '../ha-data-source.js';
import { MiDataSource } from './mi-data-source.js';
import { logger } from '../logger-service.js';

/**
 * 设备控制路由：@Device({ miGatewayDirect: true }) 标记的设备走小米中枢网关直连，其余走 HA。
 * 直连通道未就绪时 direct 设备也回退 HA。
 */
export class MiRouter {
    static #instance: MiRouter;

    #haDataSource: HADataSource;

    #miDataSource: MiDataSource;

    private constructor() {}

    init(haDataSource: HADataSource, miDataSource: MiDataSource): void {
        this.#haDataSource = haDataSource;
        this.#miDataSource = miDataSource;
    }

    call(callInfo: CallInfo): void {
        if (this.usesMiGateway(callInfo.entityId)) {
            this.#miDataSource.call(callInfo);
        } else if (this.#haDataSource) {
            this.#haDataSource.call(callInfo);
        } else {
            logger.printWarn(`[MiRouter] HA 不可用且非直连设备，指令丢失: ${callInfo.entityId}.${callInfo.service}`);
        }
    }

    /**
     * 控制路由判断：entityId 是否走小米直连下发命令。
     * 只看控制通道（云端 HTTP）就绪，不看本地 MQTT——本地网关掉线时命令仍可走云端，
     * 否则纯直连模式下会落到"HA 不可用"分支把指令丢掉。
     */
    usesMiGateway(entityId: string): boolean {
        if (!this.#miDataSource || !this.#miDataSource.isStarted || !this.#miDataSource.isControlReady) return false;
        return DeviceManager.instance.isMiGatewayEntity(entityId);
    }

    /**
     * 事件源判断：entityId 的状态是否由直连供给（供 HAWebsocketService 决定是否过滤 HA 事件）。
     * 必须看推送通道：本地与云端 MQTT 全断时返回 false，放行 HA 事件兜底，
     * 避免"命令走直连但状态没人推"导致 direct 设备状态卡死。
     */
    providesStateFor(entityId: string): boolean {
        if (!this.#miDataSource || !this.#miDataSource.isStarted || !this.#miDataSource.isPushReady) return false;
        return DeviceManager.instance.isMiGatewayEntity(entityId);
    }

    /** 控制通道就绪 */
    get miGatewayReady(): boolean {
        return !!this.#miDataSource && this.#miDataSource.isStarted && this.#miDataSource.isControlReady;
    }

    get haReady(): boolean {
        return !!this.#haDataSource;
    }

    static get instance(): MiRouter {
        if (!MiRouter.#instance) MiRouter.#instance = new MiRouter();
        return MiRouter.#instance;
    }
}

