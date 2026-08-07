import type { CallInfo } from '../call-service.js';
import type { HAEvent } from '../../types/ha-types.js';
import { MiCertManager } from './mi-cert-manager.js';
import { MiMdns } from './mi-mdns.js';
import { MiMqttService } from './mi-mqtt-service.js';
import { MiCloudMqtt } from './mi-cloud-mqtt.js';
import { MiDeviceList } from './mi-device-list.js';
import { MiTranslator } from './mi-translator.js';
import { parseEntityId } from './entity-id-parser.js';
import { DeviceManager } from '../../managers/device-manager.js';
import { logger } from '../logger-service.js';
import type { MiPropChange, MiEventChange } from './mi-types.js';

/** 去重窗口：同一 did/siid/piid 的相同值在窗口内只处理一次（本地+云端可能重复推送） */
const DEDUP_WINDOW_MS = 2000;

/** 去重表超过此条数才触发清理，避免每条推送都全表扫描 */
const DEDUP_PRUNE_THRESHOLD = 500;

/** 小米中枢网关数据源：组合认证、发现、通信、设备列表、翻译层 */
export class MiDataSource {
    static #instance: MiDataSource;

    #translator = MiTranslator.instance;

    #started = false;

    /** 属性去重：key=`${did}_${siid}_${piid}` -> {value, ts} */
    #propDedup = new Map<string, { value: any; ts: number }>();

    /** 事件去重：key=`${did}_${siid}_${eiid}` -> {ts, sig} */
    #eventDedup = new Map<string, { ts: number; sig: string }>();

    private constructor() {}

    /** 启动直连：发现网关、连接、加载设备列表、注册 direct entityId、订阅状态 */
    async start(eventHandler: (entityId: string, event: HAEvent) => void): Promise<void> {
        if (this.#started) return;

        const cert = MiCertManager.instance;
        if (!cert.isAuthenticated()) {
            throw new Error('小米未认证，请先调用 miLogin 完成 OAuth 登录');
        }
        cert.ensureReady();

        logger.print('[MiDS] 正在发现中枢网关...');
        const gateway = await MiMdns.instance.findGateway();

        logger.print('[MiDS] 正在连接中枢网关...');
        await MiMqttService.instance.connect(gateway);

        logger.print('[MiDS] 正在加载设备列表...');
        await MiDeviceList.instance.init();

        // 仅注册 direct 设备的 entityId（非 direct 走 HA，不参与直连翻译）
        const entityIds = DeviceManager.instance.getAllEntityIds().filter((id) => DeviceManager.instance.isMiGatewayEntity(id));
        this.#translator.registerEntities(entityIds);
        await this.#translator.prefillSpec(entityIds);
        // 注入事件回发通道，使 callCover 等能合成命令衍生事件（如无 status 属性 cover 的 opening/closing）
        this.#translator.setEventHandler(eventHandler);
        logger.print(`[MiDS] 已注册 ${entityIds.length} 个 direct entityId`);

        // 收集 direct 设备的 did，按 did 订阅本地网关广播
        const dids = new Set<string>();
        for (const entityId of entityIds) {
            const did = parseEntityId(entityId)?.did;
            if (did) dids.add(did);
        }
        // 本地网关广播由 master/appMsg/notify/iot/# 通配符统一接收（subscribeTopics 已订），
        // per-did 实测收不到，无需按 did 逐个订。

        // 属性/事件订阅 -> 翻译 -> 推给 EventService（仅 direct 设备，其余走 HA）
        // 本地网关 MQTT 与云端 MQTT 共用同一处理入口，去重避免双通道重复
        MiMqttService.instance.onProp((change) => this.handleProp(change, eventHandler));
        MiMqttService.instance.onEvent((change) => this.handleEvent(change, eventHandler));
        MiCloudMqtt.instance.onProp((change) => this.handleProp(change, eventHandler));
        MiCloudMqtt.instance.onEvent((change) => this.handleEvent(change, eventHandler));

        // 云端 MQTT：仅 WiFi 设备（有 localip，云端推送）订阅。网关子设备（无 localip）走本地 MQTT。
        // localip 是 push_available 的代理（本地 getDevList RPC 此网关不响应，详见 MI_GATEWAY_LOCAL_RPC.md）。
        // 连接失败仅告警，不影响本地通道。
        let cloudCount = 0;
        for (const did of dids) {
            if (MiDeviceList.instance.isCloudPush(did)) {
                MiCloudMqtt.instance.subscribeDid(did);
                cloudCount++;
            }
        }
        logger.print(`[MiDS] 云端推送设备 ${cloudCount} 个（localip）`);
        MiCloudMqtt.instance.connect().catch((error) => {
            logger.printError('[MiDS] 云端 MQTT 连接失败，仅本地通道可用');
            logger.printError(error);
        });

        // 设备列表变化：重新加载 + 更新 direct 设备在线/离线状态
        MiMqttService.instance.onDevListChange(async () => {
            await MiDeviceList.instance.init().catch((error) => logger.printError(error));
            const ts = Math.floor(Date.now() / 1000);
            for (const entityId of DeviceManager.instance.getAllEntityIds()) {
                if (!DeviceManager.instance.isMiGatewayEntity(entityId)) continue;
                const did = parseEntityId(entityId)?.did;
                if (!did) continue;
                const online = MiDeviceList.instance.getDevice(did)?.online;
                if (online == null) continue;
                const wasUnavailable = DeviceManager.instance.isUnavailableEntity(entityId);
                const isUnavailable = !online;
                if (wasUnavailable === isUnavailable) continue;
                if (isUnavailable) {
                    // 设备离线：发 unavailable 事件（复刻 HA，EventService 标记不可用且不触发 $onEvent）
                    eventHandler(entityId, { s: 'unavailable' as any, a: {} as any, c: '', lc: ts });
                } else {
                    // 设备上线：清除不可用标记，状态由后续广播补齐
                    DeviceManager.instance.setUnavailableEntity(entityId, false);
                }
            }
        });

        // 注意：#started 在 app-service.ts 的 fetchInitialState 完成后才置 true（markStarted）
        // 这样初始值全部就位前联动指令不会误触发
    }

    /** 处理属性变化（本地+云端共用，去重后翻译推送） */
    private handleProp(change: MiPropChange, eventHandler: (entityId: string, event: HAEvent) => void): void {
        const dedupKey = `${change.did}_${change.siid}_${change.piid}`;
        const now = Date.now();
        const prev = this.#propDedup.get(dedupKey);
        if (prev && prev.value === change.value && now - prev.ts < DEDUP_WINDOW_MS) {
            return; // 本地与云端重复推送，跳过
        }
        this.#propDedup.set(dedupKey, { value: change.value, ts: now });
        this.pruneDedup(this.#propDedup, now);

        const r = this.#translator.propToEvent(change);
        if (r && DeviceManager.instance.isMiGatewayEntity(r.entityId)) {
            eventHandler(r.entityId, r.event);
        }
    }

    /** 处理事件变化（本地+云端共用，去重后翻译推送） */
    private handleEvent(change: MiEventChange, eventHandler: (entityId: string, event: HAEvent) => void): void {
        const dedupKey = `${change.did}_${change.siid}_${change.eiid}`;
        const now = Date.now();
        const sig = JSON.stringify(change.arguments);
        const prev = this.#eventDedup.get(dedupKey);
        if (prev && prev.sig === sig && now - prev.ts < DEDUP_WINDOW_MS) {
            return;
        }
        this.#eventDedup.set(dedupKey, { ts: now, sig });
        this.pruneDedup(this.#eventDedup, now);

        const r = this.#translator.eventToEvent(change);
        if (r && DeviceManager.instance.isMiGatewayEntity(r.entityId)) {
            eventHandler(r.entityId, r.event);
        }
    }

    /**
     * 清理超出去重窗口的条目。
     * 去重表按 did/siid/piid 累积，400+ 设备下会长到数千条且永不释放；
     * 窗口外的条目已无判重价值，顺带清掉。
     */
    private pruneDedup(map: Map<string, { ts: number }>, now: number): void {
        if (map.size < DEDUP_PRUNE_THRESHOLD) return;
        for (const [key, item] of map) {
            if (now - item.ts >= DEDUP_WINDOW_MS) map.delete(key);
        }
    }

    /** 初始状态拉取完毕后调用，标记直连就绪，开始接受联动指令 */
    markStarted(): void {
        this.#started = true;
        logger.print('[MiDS] 小米中枢网关直连已就绪');
    }

    call(callInfo: CallInfo): void {
        // 异步执行，不阻塞 CallService 队列
        this.#translator.call(callInfo).catch((error) => {
            logger.printError('[MiDS] call 失败');
            logger.printError(error);
        });
    }

    get isStarted(): boolean {
        return this.#started;
    }

    /**
     * 控制就绪：命令走云端 HTTP，只要凭证有效即可，**与本地网关 MQTT 无关**。
     * 复刻 ha_xiaomi_home miot_client.set_prop_async：本地网关无路由时记日志后 fallback 云端，
     * 不因本地通道不可用而拒绝执行。
     */
    get isControlReady(): boolean {
        return MiCertManager.instance.isAuthenticated();
    }

    /**
     * 推送就绪：本地网关 MQTT 或云端 MQTT 任一可用。
     * 用于判断"直连能否供给状态"——两条都断时必须放行 HA 事件，否则 direct 设备彻底收不到状态。
     */
    get isPushReady(): boolean {
        return MiMqttService.instance.isConnected || MiCloudMqtt.instance.isConnected;
    }

    /** 本地网关 MQTT 是否连通（仅诊断用；控制看 isControlReady，推送看 isPushReady） */
    get isLocalMqttConnected(): boolean {
        return MiMqttService.instance.isConnected;
    }

    static get instance(): MiDataSource {
        if (!MiDataSource.#instance) MiDataSource.#instance = new MiDataSource();
        return MiDataSource.#instance;
    }
}

