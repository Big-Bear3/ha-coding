import mqtt from 'mqtt';
import { logger } from '../logger-service.js';
import { MiCertManager } from './mi-cert-manager.js';
import { MI_MQTT_KEEPALIVE } from './mi-constants.js';
import type { MiGatewayInfo, MiPropChange, MiEventChange } from './mi-types.js';

/** MIPS 消息字段类型 */
const MIPS_MSG_ID = 0;
const MIPS_MSG_RET_TOPIC = 1;
const MIPS_MSG_PAYLOAD = 2;
const MIPS_MSG_FROM = 3;

/** MQTT QoS（复刻 ha_xiaomi_home _MipsClient.MIPS_QOS=2） */
const MIPS_QOS = 2;

interface MipsMessage {
    mid: number;
    retTopic: string;
    payload: string;
    msgFrom: string;
}

/** 解包 MIPS 二进制 TLV 广播报文 */
function unpackMipsMessage(data: Buffer): MipsMessage {
    const result: MipsMessage = { mid: 0, retTopic: null, payload: null, msgFrom: null };
    let offset = 0;
    while (offset + 5 <= data.length) {
        const len = data.readUInt32LE(offset);
        const type = data.readUInt8(offset + 4);
        const fieldData = data.subarray(offset + 5, offset + 5 + len);
        offset += 5 + len;
        switch (type) {
            case MIPS_MSG_ID:
                if (fieldData.length >= 4) result.mid = fieldData.readUInt32LE(0);
                break;
            case MIPS_MSG_RET_TOPIC:
                result.retTopic = fieldData.toString('utf8').replace(/\0+$/, '');
                break;
            case MIPS_MSG_PAYLOAD:
                result.payload = fieldData.toString('utf8').replace(/\0+$/, '');
                break;
            case MIPS_MSG_FROM:
                result.msgFrom = fieldData.toString('utf8').replace(/\0+$/, '');
                break;
        }
    }
    return result;
}

/**
 * 小米中枢网关 MQTT 通信服务（mTLS + MIPS 二进制协议）。
 *
 * 仅接收网关广播（属性/事件/设备列表变化）。设备全量列表与控制走云端 HTTP（MiCloudHttp）。
 * 本地 RPC（master/proxy/*，如 getDevList）当前网关不响应，未启用--见 MI_GATEWAY_LOCAL_RPC.md。
 */
export class MiMqttService {
    static #instance: MiMqttService;

    #client: mqtt.MqttClient;

    #virtualDid: string;

    #propHandlers = new Set<(change: MiPropChange) => void>();

    #eventHandlers = new Set<(change: MiEventChange) => void>();

    #devListHandlers = new Set<(devList: string[]) => void>();

    #connected = false;

    private constructor() {}

    /** 连接中枢网关 */
    connect(gateway: MiGatewayInfo): Promise<void> {
        const cert = MiCertManager.instance;
        this.#virtualDid = cert.getVirtualDid();

        return new Promise((resolve, reject) => {
            this.#client = mqtt.connect(`mqtts://${gateway.host}:${gateway.port}`, {
                clientId: this.#virtualDid,
                protocolVersion: 5,
                keepalive: MI_MQTT_KEEPALIVE,
                clean: true,
                ca: cert.getCaCert(),
                cert: cert.getUserCert(),
                key: cert.getUserKey(),
                rejectUnauthorized: false,
                reconnectPeriod: 6000,
                connectTimeout: 10 * 1000
            });

            this.#client.on('connect', () => {
                this.#connected = true;
                this.subscribeTopics();
                logger.print(`[MiMqtt] 已连接中枢网关 ${gateway.host}:${gateway.port}`);
                resolve();
            });

            this.#client.on('message', (topic, payload: Buffer) => {
                this.onMessage(topic, payload);
            });

            this.#client.on('error', (error) => {
                logger.printError('[MiMqtt] ' + error.message);
                if (!this.#connected) {
                    this.disconnect();
                    reject(error);
                }
            });

            this.#client.on('close', () => {
                this.#connected = false;
                logger.printWarn('[MiMqtt] 连接断开，将自动重连');
            });

            this.#client.on('reconnect', () => {
                logger.print('[MiMqtt] 正在重连...');
            });
        });
    }

    /** 连接成功后订阅广播 topic */
    private subscribeTopics(): void {
        const sub = (topic: string) =>
            this.#client.subscribe(topic, { qos: MIPS_QOS }, (err, granted) => {
                if (err) logger.printError(`[MiMqtt] 订阅失败 ${topic}: ${err.message}`);
                else logger.print(`[MiMqtt] 订阅 ${topic} qos=${granted?.map((g) => g.qos).join(',')}`);
            });
        // 自身 topic：reply + 设备列表变化
        sub(`${this.#virtualDid}/#`);
        sub('master/appMsg/devListChange');
        // 设备属性/事件广播：master 通配符是实际能收到推送的订阅
        // （per-did appMsg/notify/iot/{did}/property/# 经实测收不到--广播实际发往 master 树）。
        // HA 在线时 direct 实体由 HAWebsocketService 按 providesStateFor 过滤掉 HA 事件，只走直连。
        sub('master/appMsg/notify/iot/#');
    }

    private onMessage(topic: string, payload: Buffer): void {
        let msg: MipsMessage;
        try {
            msg = unpackMipsMessage(payload);
        } catch {
            return;
        }

        if (!msg.payload) return;

        let data: any;
        try {
            data = JSON.parse(msg.payload);
        } catch {
            return;
        }

        // 属性广播
        if (topic.includes('/property/')) {
            if (data.did != null && data.siid != null && data.piid != null) {
                const change: MiPropChange = {
                    did: data.did,
                    siid: data.siid,
                    piid: data.piid,
                    value: data.value
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

        // 事件广播
        if (topic.includes('/event/')) {
            if (data.did != null && data.siid != null && data.eiid != null) {
                const change: MiEventChange = {
                    did: data.did,
                    siid: data.siid,
                    eiid: data.eiid,
                    arguments: Array.isArray(data.arguments) ? data.arguments : []
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

        // 设备列表变化
        if (topic.includes('devListChange')) {
            const devList = data.devList;
            if (Array.isArray(devList)) {
                for (const handler of this.#devListHandlers) {
                    try {
                        handler(devList);
                    } catch (error) {
                        logger.printError(error);
                    }
                }
            }
        }
    }

    /** 订阅属性变化 */
    onProp(handler: (change: MiPropChange) => void): void {
        this.#propHandlers.add(handler);
    }

    /** 订阅事件 */
    onEvent(handler: (change: MiEventChange) => void): void {
        this.#eventHandlers.add(handler);
    }

    /** 订阅设备列表变化 */
    onDevListChange(handler: (devList: string[]) => void): void {
        this.#devListHandlers.add(handler);
    }

    get isConnected(): boolean {
        return this.#connected;
    }

    /** 断开连接 */
    disconnect(): void {
        if (this.#client) {
            this.#client.end(true);
            this.#client = null;
        }
        this.#connected = false;
    }

    static get instance(): MiMqttService {
        if (!MiMqttService.#instance) MiMqttService.#instance = new MiMqttService();
        return MiMqttService.#instance;
    }
}

