import mqtt from 'mqtt';
import { logger } from '../logger-service.js';
import { MiCertManager } from './mi-cert-manager.js';
import { MI_CLOUD_BROKER_HOST, MI_OAUTH2_CLIENT_ID, MI_MQTT_KEEPALIVE } from './mi-constants.js';
import type { MiPropChange, MiEventChange } from './mi-types.js';

/**
 * 小米云端 MQTT 客户端（复刻 ha_xiaomi_home MipsCloudClient）。
 *
 * 部分设备（如晾衣架、窗帘）不走中枢网关本地推送（push_available=false），
 * 其状态变化经云端 broker 推送，topic 为 device/{did}/up/properties_changed/...
 * payload 为裸 JSON（非 MIPS TLV）：{params:{siid,piid,value}}。
 *
 * 与本地网关 MQTT（MiMqttService）互补：本地收不到的设备由云端补齐。
 */
export class MiCloudMqtt {
    static #instance: MiCloudMqtt;

    #client: mqtt.MqttClient;

    #propHandlers = new Set<(change: MiPropChange) => void>();

    #eventHandlers = new Set<(change: MiEventChange) => void>();

    #connected = false;

    /** 已登记待订阅的 did（连接/重连后统一订阅） */
    #subscribedDids = new Set<string>();

    private constructor() {}

    /** 连接云端 MQTT broker */
    async connect(): Promise<void> {
        const cert = MiCertManager.instance;
        const token = await cert.getValidAccessToken();
        const host = `${cert.cloudServer}-${MI_CLOUD_BROKER_HOST}`;
        // clientId 用 ha.{virtualDid}（数字，无横线）。云端 broker 拒绝带横线的 UUID 格式（Not authorized）。
        const clientId = `ha.${cert.getVirtualDid()}`;

        return new Promise((resolve, reject) => {
            this.#client = mqtt.connect(`mqtts://${host}:8883`, {
                clientId,
                protocolVersion: 5,
                keepalive: MI_MQTT_KEEPALIVE,
                clean: true,
                username: MI_OAUTH2_CLIENT_ID,
                password: token,
                rejectUnauthorized: false,
                reconnectPeriod: 6000,
                connectTimeout: 10 * 1000
            });

            this.#client.on('connect', () => {
                this.#connected = true;
                this.subscribeAll();
                logger.print(`[MiCloudMqtt] 已连接云端 MQTT ${host}:8883`);
                resolve();
            });

            this.#client.on('message', (topic, payload: Buffer) => {
                this.onMessage(topic, payload);
            });

            this.#client.on('disconnect', (packet: any) => {
                // MQTT v5 服务端主动 DISCONNECT，reason code 指示原因
                logger.printWarn(`[MiCloudMqtt] 服务端 DISCONNECT，reason=${packet?.reasonCode}`);
            });

            this.#client.on('error', (error) => {
                logger.printError('[MiCloudMqtt] ' + error.message);
                if (!this.#connected) {
                    this.disconnect();
                    reject(error);
                }
            });

            this.#client.on('close', () => {
                this.#connected = false;
                logger.printWarn('[MiCloudMqtt] 云端连接断开，将自动重连');
            });
        });
    }

    /** 登记 did；已连接则立即订阅，否则连接/重连后由 subscribeAll 统一订阅 */
    subscribeDid(did: string): void {
        if (!did || this.#subscribedDids.has(did)) return;
        this.#subscribedDids.add(did);
        if (this.#connected) {
            this.sub(`device/${did}/up/properties_changed/#`);
            this.sub(`device/${did}/up/event_occured/#`);
        }
    }

    /**
     * 连接/重连后按 did 分批订阅。
     * 云端 broker 对突发大量 SUBSCRIBE 敏感（会 DISCONNECT），分小批 + 间隔，模仿 paho-mqtt 的 inflight 限流
     * （ha_xiaomi_home 用 paho，默认 ~20 inflight；mqtt.js 会一次性突发全部，触发断连）。
     */
    private subscribeAll(): void {
        if (!this.#connected) return;
        const dids = Array.from(this.#subscribedDids);
        if (!dids.length) return;
        const BATCH = 15; // 每批 did 数（×2 = 30 订阅），远低于 broker 突发阈值 ~300
        const INTERVAL = 500; // 批次间隔 ms，留时间给 broker 处理
        let i = 0;
        const batch = (): void => {
            if (!this.#connected) return;
            for (const did of dids.slice(i, i + BATCH)) {
                this.sub(`device/${did}/up/properties_changed/#`);
                this.sub(`device/${did}/up/event_occured/#`);
            }
            i += BATCH;
            if (i < dids.length) {
                setTimeout(batch, INTERVAL);
            } else {
                logger.print(`[MiCloudMqtt] 订阅完成，共 ${dids.length} 个云端推送设备`);
            }
        };
        logger.print(`[MiCloudMqtt] 分批订阅 ${dids.length} 个云端推送设备（每批 ${BATCH}，间隔 ${INTERVAL}ms）`);
        batch();
    }

    private sub(topic: string): void {
        this.#client.subscribe(topic, { qos: 1 }, (err) => {
            if (err) logger.printError(`[MiCloudMqtt] 订阅失败 ${topic}: ${err.message}`);
        });
    }

    private onMessage(topic: string, payload: Buffer): void {
        let data: any;
        try {
            data = JSON.parse(payload.toString('utf8'));
        } catch {
            return;
        }
        // topic: device/{did}/up/properties_changed/{siid}/{piid}
        const parts = topic.split('/');
        const did = parts.length > 1 ? parts[1] : null;
        if (!did) return;
        // 云端 payload 包一层 params
        const params = data?.params ?? data;

        if (topic.includes('/up/properties_changed/')) {
            if (params?.siid != null && params?.piid != null) {
                const change: MiPropChange = {
                    did,
                    siid: params.siid,
                    piid: params.piid,
                    value: params.value
                };
                for (const handler of this.#propHandlers) {
                    try {
                        handler(change);
                    } catch (error) {
                        logger.printError(error);
                    }
                }
            }
            return;
        }
        if (topic.includes('/up/event_occured/')) {
            if (params?.siid != null && params?.eiid != null) {
                const change: MiEventChange = {
                    did,
                    siid: params.siid,
                    eiid: params.eiid,
                    arguments: Array.isArray(params.arguments) ? params.arguments : []
                };
                for (const handler of this.#eventHandlers) {
                    try {
                        handler(change);
                    } catch (error) {
                        logger.printError(error);
                    }
                }
            }
            return;
        }
    }

    onProp(handler: (change: MiPropChange) => void): void {
        this.#propHandlers.add(handler);
    }

    onEvent(handler: (change: MiEventChange) => void): void {
        this.#eventHandlers.add(handler);
    }

    get isConnected(): boolean {
        return this.#connected;
    }

    disconnect(): void {
        if (this.#client) {
            this.#client.end(true);
            this.#client = null;
        }
        this.#connected = false;
    }

    static get instance(): MiCloudMqtt {
        if (!MiCloudMqtt.#instance) MiCloudMqtt.#instance = new MiCloudMqtt();
        return MiCloudMqtt.#instance;
    }
}

