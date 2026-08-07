# 小米中枢网关本地 RPC（getDevList / push_available）

> 状态：**未启用**。当前网关（xiaomi.gateway.hub1）不响应本地 RPC，代码已移除。
> 本文档记录实现方案与完整代码，**网关固件修复后可直接加回**，用权威 `push_available` 取代 localip 代理。

## 背景

ha_xiaomi_home 用本地 `proxy/getDevList` RPC 获取网关下设备列表，其中 `pushAvailable` 字段权威标识每个设备是否走网关本地推送：

- `push_available=true` → 本地 MQTT 推送（`appMsg/notify/iot/{did}/property/#`）
- `push_available=false` → 云端 MQTT 推送（`device/{did}/up/properties_changed/#`）

按 `push_available` 逐设备路由（local XOR cloud）是官方做法。我们当前用 `localip` 字段代理（WiFi 设备=云端推送），但 `localip` 是物理特征非推送特征，可能误判（个别 WiFi 设备也走本地推送会被多订云端）。

## 为什么未启用

实测 `xiaomi.gateway.hub1`（固件 v0.10.8）对 `master/proxy/getDevList` RPC **不响应**（单条请求 10s 超时，无任何回复）：

- 实现完全复刻 ha_xiaomi_home `__request`（同身份 virtualDid + OAuth 证书、同 topic、同 payload），排除实现问题。
- ha_xiaomi_home（参考实现）在**同一台网关**上同样超时（HA 日志：`on mips request timeout, master/proxy/getDevList`，每 60s 重试都失败），回退全云端。
- 已排除 ShellClash：到网关的 MQTT TCP 8883 不经 Clash（端口不在拦截列表 + 局域网绕过）。
- 官方仓库相关 issue 至今未修：[#1679](https://github.com/XiaoMi/ha_xiaomi_home/issues/1679)、[#1586](https://github.com/XiaoMi/ha_xiaomi_home/issues/1586)、[#1757](https://github.com/XiaoMi/ha_xiaomi_home/issues/1757)、[#1310](https://github.com/XiaoMi/ha_xiaomi_home/issues/1310)。

本地**广播**能收到（`master/appMsg/notify/iot/#` 通配符），本地 **RPC**（getDevList / get / set）不通。这是 hub1 固件对 `master/proxy/*` 的支持问题。

## 修复后如何加回

当网关固件支持 `proxy/getDevList` 后，在 `src/services/mi/mi-mqtt-service.ts` 加回以下代码。

### 1. TLV 编码函数（`unpackMipsMessage` 之后）

```typescript
/** 打包 MIPS 二进制 TLV 请求报文（复刻 ha_xiaomi_home _MipsMessage.pack） */
function packMipsMessage(mid: number, payload: string, retTopic: string, msgFrom = 'local'): Buffer {
    const parts: Buffer[] = [];
    const idBuf = Buffer.alloc(9);
    idBuf.writeUInt32LE(4, 0);
    idBuf.writeUInt8(MIPS_MSG_ID, 4);
    idBuf.writeUInt32LE(mid, 5);
    parts.push(idBuf);
    const strField = (type: number, value: string): void => {
        const bytes = Buffer.from(value, 'utf8');
        const buf = Buffer.alloc(5 + bytes.length + 1);
        buf.writeUInt32LE(bytes.length + 1, 0);
        buf.writeUInt8(type, 4);
        bytes.copy(buf, 5);
        parts.push(buf);
    };
    if (msgFrom) strField(MIPS_MSG_FROM, msgFrom);
    if (retTopic) strField(MIPS_MSG_RET_TOPIC, retTopic);
    strField(MIPS_MSG_PAYLOAD, payload);
    return Buffer.concat(parts);
}
```

### 2. 字段（类内）

```typescript
#mid = 0;
#requestMap = new Map<string, { resolve: (payload: string) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
```

### 3. request + getDevList 方法

```typescript
/** 本地 RPC 请求：发布到 master/{topic}，在 {virtualDid}/reply 等 mid 配对回复。超时/断连 reject。 */
request(topic: string, payload = '{}', timeoutMs = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!this.#connected) { reject(new Error('[MiMqtt] 未连接，无法发 RPC')); return; }
        const mid = ++this.#mid;
        const timer = setTimeout(() => {
            this.#requestMap.delete(String(mid));
            reject(new Error(`[MiMqtt] RPC 超时 ${topic} mid=${mid}`));
        }, timeoutMs);
        this.#requestMap.set(String(mid), { resolve, reject, timer });
        const buf = packMipsMessage(mid, payload, `${this.#virtualDid}/reply`);
        this.#client.publish(`master/${topic}`, buf, { qos: MIPS_QOS }, (err) => {
            if (err) {
                clearTimeout(timer);
                this.#requestMap.delete(String(mid));
                reject(new Error(`[MiMqtt] RPC 发布失败 ${topic}: ${err.message}`));
            }
        });
    });
}

/** 本地 getDevList RPC：返回 {did: {pushAvailable, online}}，失败返回 null。 */
async getDevList(): Promise<Record<string, { pushAvailable: boolean; online: boolean }> | null> {
    try {
        const payload = JSON.stringify({ info: ['name', 'model', 'urn', 'online', 'specV2Access', 'pushAvailable'] });
        const resp = await this.request('proxy/getDevList', payload);
        const devList = JSON.parse(resp)?.devList;
        if (!devList || typeof devList !== 'object') return null;
        const out: Record<string, { pushAvailable: boolean; online: boolean }> = {};
        for (const [did, info] of Object.entries<any>(devList)) {
            out[did] = { pushAvailable: !!info?.pushAvailable, online: !!info?.online };
        }
        return out;
    } catch (error) {
        logger.printError(`[MiMqtt] getDevList 失败：${error instanceof Error ? error.message : error}`);
        return null;
    }
}
```

### 4. onMessage 回复处理（onMessage 开头，unpack 之后、`if (!msg.payload)` 之前）

```typescript
// RPC 回复：{virtualDid}/reply，按 mid 配对 resolve 请求
if (topic === `${this.#virtualDid}/reply`) {
    const req = this.#requestMap.get(String(msg.mid));
    if (req) {
        clearTimeout(req.timer);
        this.#requestMap.delete(String(msg.mid));
        req.resolve(msg.payload ?? '{}');
    }
    return;
}
```

### 5. 路由（`mi-data-source.ts` 云端订阅处，用 push_available 取代 localip）

```typescript
const localDevList = await MiMqttService.instance.getDevList();
let cloudCount = 0;
for (const did of dids) {
    // push_available=false 或不在本地列表（云端专属）→ 云端；true → 本地
    const isCloudPush = localDevList ? !localDevList[did]?.pushAvailable : MiDeviceList.instance.isCloudPush(did);
    if (isCloudPush) {
        MiCloudMqtt.instance.subscribeDid(did);
        cloudCount++;
    }
}
```

## 验证

加回后启动，日志应出现 `getDevList 成功：N 个设备，push_available=true M 个`。若仍 `RPC 超时 proxy/getDevList`，说明网关固件仍未修复，继续用 localip 代理。

