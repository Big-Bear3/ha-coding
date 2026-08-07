import Bonjour from 'bonjour-service';
import { logger } from '../logger-service.js';
import { MI_CENTRAL_GATEWAY_PORT } from './mi-constants.js';
import type { MiGatewayInfo } from './mi-types.js';

/** 解析中枢网关 mDNS profile（base64 二进制），复刻 ha_xiaomi_home MipsServiceData */
function parseProfile(profileB64: string): { did: string; groupId: string; role: number; suiteMqtt: boolean } {
    try {
        const bin = Buffer.from(profileB64, 'base64');
        // did: bytes[1:9] big-endian int；group_id: bytes[9:17] 反转后 hex
        const did = bin.readBigInt64BE(1).toString();
        const groupId = bin.subarray(9, 17).reverse().toString('hex');
        const role = bin[20] >> 4;
        const suiteMqtt = ((bin[22] >> 1) & 0x01) === 1;
        return { did, groupId, role, suiteMqtt };
    } catch {
        return { did: '', groupId: '', role: 0, suiteMqtt: false };
    }
}

/** 通过 mDNS 发现小米中枢网关（_miot-central._tcp.local.） */
export class MiMdns {
    static #instance: MiMdns;

    private constructor() {}

    /** 发现中枢网关，优先选 role==1 && suiteMqtt 的主网关（复刻 ha_xiaomi_home valid_service） */
    findGateway(timeoutMs = 10000): Promise<MiGatewayInfo> {
        return new Promise((resolve, reject) => {
            const bonjour = new Bonjour();
            const candidates: MiGatewayInfo[] = [];
            let settled = false;

            const cleanup = (): void => {
                try {
                    bonjour.destroy();
                } catch {}
            };

            const finish = (): void => {
                if (settled) return;
                settled = true;
                cleanup();
                if (!candidates.length) {
                    reject(new Error('mDNS 未发现中枢网关'));
                    return;
                }
                // 优先选主网关（role==1 && suiteMqtt），否则取首个
                const primary = candidates.find((c) => (c as any).role === 1 && (c as any).suiteMqtt);
                resolve(primary ?? candidates[0]);
            };

            const timer = setTimeout(finish, timeoutMs);

            // _miot-central._tcp 的 type 为 miot-central
            bonjour.find({ type: 'miot-central', protocol: 'tcp' }, (service) => {
                const host = service.addresses?.[0] ?? service.referer?.address;
                if (!host) return;

                const txt = service.txt ?? {};
                const profile = typeof txt.profile === 'string' ? txt.profile : '';
                const info = profile ? parseProfile(profile) : { did: '', groupId: '', role: 0, suiteMqtt: false };
                const groupId = info.groupId || (txt.group_id ?? txt.groupId ?? '');
                const did = info.did || (txt.did ?? service.name ?? '');
                const port = service.port || MI_CENTRAL_GATEWAY_PORT;

                const gateway: MiGatewayInfo & { role: number; suiteMqtt: boolean } = {
                    host,
                    port,
                    groupId,
                    did,
                    role: info.role,
                    suiteMqtt: info.suiteMqtt
                };
                candidates.push(gateway);
                logger.print(
                    `[MiMdns] 发现中枢网关 ${host}:${port} did=${did} group=${groupId} role=${info.role} suiteMqtt=${info.suiteMqtt}`
                );

                // 收齐主网关立即返回，否则等超时收更多
                if (info.role === 1 && info.suiteMqtt) {
                    clearTimeout(timer);
                    finish();
                }
            });
        });
    }

    static get instance(): MiMdns {
        if (!MiMdns.#instance) MiMdns.#instance = new MiMdns();
        return MiMdns.#instance;
    }
}

