import { logger } from '../logger-service.js';
import { MiMqttService } from './mi-mqtt-service.js';
import { MiCloudHttp } from './mi-cloud-http.js';
import type { MiDeviceInfo } from './mi-types.js';

/** slugify，复刻 ha_xiaomi_home 的 python-slugify 行为（非字母数字转下划线） */
function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/** 中枢网关设备列表缓存，用于 did 解析兜底与 spec 入口 */
export class MiDeviceList {
    static #instance: MiDeviceList;

    #devices = new Map<string, MiDeviceInfo>();

    #didTagToDid = new Map<string, string>();

    #initialized = false;

    private constructor() {}

    /** 拉取设备列表并监听变化 */
    async init(): Promise<void> {
        await this.load();
        if (!this.#initialized) {
            this.#initialized = true;
            // 注意：devListChange 只来自本地网关 MQTT。本地通道断开时不会触发，
            // 此时新增/改名设备需靠重启或 refresh() 才能进入列表。
            MiMqttService.instance.onDevListChange(() => {
                this.load().catch((error) => logger.printError(error));
            });
        }
    }

    /** 强制重新拉取设备列表（本地 MQTT 不可用时 devListChange 收不到，可手动调用） */
    async refresh(): Promise<void> {
        await this.load();
    }

    private async load(): Promise<void> {
        // 设备全量列表走云端 HTTP（账号下所有设备）；本地 getDevList 只返回网关下设备，用于 push_available 路由
        const devList = await MiCloudHttp.instance.getDeviceList();
        this.#devices.clear();
        this.#didTagToDid.clear();
        for (const [did, info] of Object.entries<any>(devList ?? {})) {
            if (!info?.urn || !info?.model) continue;
            const deviceInfo: MiDeviceInfo = {
                did,
                model: info.model,
                urn: info.urn,
                online: !!info.online,
                name: info.name,
                localIp: info.localIp ?? null
            };
            this.#devices.set(did, deviceInfo);
            this.#didTagToDid.set(slugify(`cn_${did}`), did);
        }
        logger.print(`[MiDeviceList] 已加载 ${this.#devices.size} 个设备`);
    }

    getDevice(did: string): MiDeviceInfo {
        return this.#devices.get(did);
    }

    /**
     * 是否需要订阅云端 MQTT 推送。
     *
     * 判定依据（本地 getDevList RPC 不可用，拿不到权威 push_available，详见 MI_GATEWAY_LOCAL_RPC.md）：
     * 1. BLE 设备（did 以 blt. 开头）：一律订阅。BLE 不是网关的有线/WiFi 子设备，
     *    不稳定走网关本地广播；且云端 device_list_page 对 BLE 的 localip 不可靠
     *    （实测有的为 null、有的是路由器分配的 IPv6，均与推送路径无关）。
     *    官方 miot_client 也对 blt./proxy. 前缀设备做特殊处理（不订阅上下线状态）。
     * 2. 其余设备：有 localip 视为 WiFi 设备走云端；无 localip 视为网关子设备走本地广播。
     *
     * 注意：这是"是否额外订阅云端"，本地广播通道始终生效（master 通配符），
     * 两条通道重复推送由 MiDataSource 的 2s 去重窗口消化。
     */
    isCloudPush(did: string): boolean {
        if (did?.startsWith('blt.') || did?.startsWith('proxy.')) return true;
        return !!this.#devices.get(did)?.localIp;
    }

    /** 在 entity_id 中匹配 did_tag，返回 did（覆盖 BLE 等含点号 did） */
    matchDid(entityId: string): string {
        for (const [didTag, did] of this.#didTagToDid) {
            // 锚定 _didTag_，避免 cn_123 误匹配 cn_1234 的子串
            if (entityId.includes(`_${didTag}_`)) return did;
        }
        return undefined;
    }

    getAllDevices(): MiDeviceInfo[] {
        return Array.from(this.#devices.values());
    }

    get size(): number {
        return this.#devices.size;
    }

    static get instance(): MiDeviceList {
        if (!MiDeviceList.#instance) MiDeviceList.#instance = new MiDeviceList();
        return MiDeviceList.#instance;
    }
}

