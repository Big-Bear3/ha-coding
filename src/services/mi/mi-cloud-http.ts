import axios from 'axios';
import { logger } from '../logger-service.js';
import { MiCertManager } from './mi-cert-manager.js';
import { MI_OAUTH2_CLIENT_ID, MI_OAUTH2_API_HOST, MI_HTTP_API_TIMEOUT } from './mi-constants.js';

/**
 * 小米云端 HTTP 客户端：设备列表 + 属性读写 + 动作调用。
 *
 * 复刻 ha_xiaomi_home MIoTHttpClient 的接口与鉴权（Bearer token，非 MIC 签名）。
 * 本地中枢网关 RPC 不可达时，设备列表与控制均走云端。
 */
export class MiCloudHttp {
    static #instance: MiCloudHttp;

    #certManager = MiCertManager.instance;

    private constructor() {}

    /** 云端 API 请求头（复刻 ha_xiaomi_home MIoTHttpClient.__api_request_headers） */
    private async headers(): Promise<Record<string, string>> {
        const token = await this.#certManager.getValidAccessToken();
        return {
            'X-Client-BizId': 'haapi',
            'Content-Type': 'application/json',
            Authorization: `Bearer${token}`,
            'X-Client-AppId': MI_OAUTH2_CLIENT_ID
        };
    }

    /** POST 云端接口，校验 code==0，返回 result */
    private async post(urlPath: string, data: any, timeoutSec = MI_HTTP_API_TIMEOUT): Promise<any> {
        const res = await axios.post(`https://${MI_OAUTH2_API_HOST}${urlPath}`, data, {
            headers: await this.headers(),
            timeout: timeoutSec * 1000
        });
        const body = res.data;
        if (body?.code !== 0) {
            throw new Error(`[MiCloudHttp] ${urlPath} 失败: code=${body?.code} message=${body?.message}`);
        }
        return body?.result;
    }

    /**
     * 拉取全量设备列表（分页，复刻 ha_xiaomi_home __get_device_list_page_async）。
     * 返回 { did: { did, name, urn, model, online } }
     */
    async getDeviceList(): Promise<
        Record<string, { did: string; name: string; urn: string; model: string; online: boolean; localIp: string | null }>
    > {
        const devices: Record<string, any> = {};
        let startDid: string = null;
        do {
            const reqData: any = {
                limit: 200,
                get_split_device: true,
                get_third_device: true,
                dids: []
            };
            if (startDid) reqData.start_did = startDid;
            const result = await this.post('/app/v2/home/device_list_page', reqData);
            for (const device of result?.list ?? []) {
                const did = device.did;
                if (!did || !device.name) continue;
                if (!device.spec_type || !device.model) continue;
                if (did.startsWith('miwifi.')) continue;
                devices[did] = {
                    did,
                    name: device.name,
                    urn: device.spec_type,
                    model: device.model,
                    online: !!device.isOnline,
                    // localip 有值=WiFi 设备（云端推送）；无值=网关子设备（本地推送）
                    localIp: device.localip ?? null
                };
            }
            startDid = result?.has_more ? result?.next_start_did : null;
        } while (startDid);
        return devices;
    }

    /** 读单个属性（复刻 ha_xiaomi_home __get_prop_async） */
    async getProp(did: string, siid: number, piid: number): Promise<any> {
        const result = await this.post('/app/v2/miotspec/prop/get', {
            datasource: 1,
            params: [{ did, siid, piid }]
        });
        return result?.[0]?.value ?? null;
    }

    /** 批量读属性（复刻 ha_xiaomi_home get_props_async） */
    async getProps(
        params: { did: string; siid: number; piid: number }[]
    ): Promise<{ did: string; siid: number; piid: number; value: any }[]> {
        const result = await this.post('/app/v2/miotspec/prop/get', {
            datasource: 1,
            params
        });
        return result ?? [];
    }

    /**
     * 设置属性（复刻 ha_xiaomi_home set_prop_async）。
     * code 不在 [0, 1] 时抛错——0=成功，1 官方同样视为成功。
     * 抛错而非仅打日志：否则设备拒绝（超范围/离线）与成功在上层完全无法区分。
     */
    async setProp(did: string, siid: number, piid: number, value: any): Promise<any> {
        const result = await this.post('/app/v2/miotspec/prop/set', { params: [{ did, siid, piid, value }] }, 15);
        this.assertExecOk(result?.[0], `setProp did=${did} siid=${siid} piid=${piid} value=${JSON.stringify(value)}`);
        return result;
    }

    /** 调用动作（复刻 ha_xiaomi_home action_async，in 只传 value 数组） */
    async action(did: string, siid: number, aiid: number, inList: { piid: number; value: any }[]): Promise<any> {
        const result = await this.post(
            '/app/v2/miotspec/action',
            { params: { did, siid, aiid, in: inList.map((item) => item.value) } },
            15
        );
        // action 返回 result 为对象（非数组），code 位置同样在 result 内
        this.assertExecOk(result, `action did=${did} siid=${siid} aiid=${aiid}`);
        return result;
    }

    /**
     * 校验执行结果 code（复刻 ha_xiaomi_home：rc in [0, 1] 为成功，否则抛错）。
     * -704010000 / -704042011 表示设备被删除或离线，单独提示。
     */
    private assertExecOk(item: any, context: string): void {
        const code = item?.code;
        if (code == null || code === 0 || code === 1) return;
        const message = item?.message ? ` ${item.message}` : '';
        if (code === -704010000 || code === -704042011) {
            // 设备离线/已被删除：正常情况，用 warn 而非 error 降低日志噪声
            logger.printWarn(`[MiCloudHttp] ${context} 跳过：设备可能离线或已删除 code=${code}${message}`);
            return; // 不抛错，让上层静默跳过
        }
        throw new Error(`[MiCloudHttp] ${context} 失败 code=${code}${message}`);
    }

    static get instance(): MiCloudHttp {
        if (!MiCloudHttp.#instance) MiCloudHttp.#instance = new MiCloudHttp();
        return MiCloudHttp.#instance;
    }
}

