---
name: xiaomi-direct
description: 为 ha-coding 编写小米设备配置（entity_id 生成、@Device/@State/$onEvent、发现工具、miLogin、直连限制）。在用户编写小米设备/自动化代码时使用。
---

# 小米中枢网关直连（ha-coding）配置指南

为 ha-coding 编写小米设备配置时遵循本指南。目标用户可能**没装 Home Assistant**（纯小米直连）。

## 1. 前置：miLogin（一次性）

小米直连需 OAuth 登录 + 云端签证书。在用户项目根目录执行（框架的 miLogin 流程）：

- 浏览器打开授权 URL -> 登录小米账号 -> 复制跳转后的 URL 粘贴回控制台。
- 凭证存入 `.localstorage/mi_auth_info`（token）+ 证书。之后自动刷新。
- OAuth redirect_uri 硬编码 `homeassistant.local:8123`（小米只认这个），用手工复制授权码，**不需要真有 HA**。

## 2. config.js（HA 可选）

```js
export default {
    IP_ADDRESS_PORT: '192.168.x.x:8123', // HA 地址；不装 HA 留空/删掉 -> 纯小米直连模式
    HA_USER_NAME: '', // HA 用户名（无 HA 留空）
    HA_PASSWORD: '', // HA 密码（无 HA 留空）
    IMMEDIATE_CALL: false,
    GEOGRAPHIC_LOCATION: [纬度, 经度, 海拔] // 日出日落自动化用
};
```

未配 `IP_ADDRESS_PORT` 时框架自动跳过 HA，只走小米直连（`HA_ENABLED=false`）。

## 3. 发现设备 + 生成 entity_id（关键，别手拼）

entity_id 是 ha_xiaomi_home 格式，手拼易错（model 拆段、slugify、domain 映射）。**用发现工具**：

```bash
# 在已 miLogin 的项目根目录运行（含 .localstorage/mi_auth_info）
node ha-coding/scripts/discover-devices.mjs [过滤词]
# -> 生成 ./mi-devices-discovered.md（每设备的 entity_id 清单 + @Device 模板）
```

工具拉账号设备列表 + miot-spec，按官方规则生成 entity_id，含 domain 建议、属性/事件/动作、@Device 模板。

## 4. entity_id 格式（理解用，别手拼）

```
{domain}.{model[0][:9]}_{did_tag}_{model[-1][:20]}_{slugify(spec_name)}_{p|e|a}_{siid}_{id}
```

- `model[0]`/`model[-1]`：model 按 `.` 拆，首段[:9] + 末段[:20]（中段丢弃）。
- `did_tag = slugify('{cloud_server}_{did}')`，cn 区即 `slugify('cn_' + did)`。**整体 slugify，不是字符串拼接**：
    - 纯数字 did（WiFi 设备）：`1009864570` -> `cn_1009864570`（看起来像拼接，实际一致）
    - BLE did 含点号：`blt.3.abc` -> `cn_blt_3_abc`（点号转下划线）
    - 群组 did：`group.123` -> `cn_group_123`
      漏了这层 slugify，BLE/群组设备的 entity_id 会带点号，非法且与 HA 实际值不符。
- `slugify(spec_name)`：spec 属性名小写、非字母数字转下划线。
- 尾部：`_p_{siid}_{piid}`（属性）/`_e_{siid}_{eiid}`（事件）/`_a_{siid}_{aiid}`（动作）。
- `domain`：由设备类型+属性决定（switch/sensor/cover/light/binary_sensor/event/action）。

例：`switch.giot_cn_1009864570_v3oodm_on_p_2_1` = 浴霸 on 属性（siid=2,piid=1）。

## 5. 写 @Device 配置

参考发现工具生成的模板，按设备类型精简（只留要用的属性）。参考 J.N `src/devices-def/` 的现有设备类。

**设备定义**（`src/devices-def/`）：`$entityIds` 只声明**类型**，不写死 entity_id。

```typescript
import { Device, DeviceDef, HAEvent, State } from 'ha-coding';

@Device({ miGatewayDirect: true }) // 走小米直连，不经过 HA
// 注：HA 未启用时 miGatewayDirect 默认 true，可省略写 @Device()；HA 启用时需显式 true
export class MiSwitch implements DeviceDef {
    $entityIds: { switch: string };

    @State(function (this: MiSwitch, value: MiSwitch['on']) {
        return { service: value ? 'turn_on' : 'turn_off', entityId: this.$entityIds.switch };
    })
    on: boolean;

    $onEvent({ a, s }: HAEvent, entityId: string): void {
        if (entityId !== this.$entityIds.switch) return;
        if (s === 'on') this.on = true;
        else if (s === 'off') this.on = false;
    }
}
```

**设备实例**（`src/devices/`）：entity_id 在 `createDevice` 时传入。同一个定义类可以创建多个实例（多个同型号设备）。

```typescript
import { createDevice } from 'ha-coding';
import { MiSwitch } from '../devices-def/mi-switch.js';

export const bathHeater = createDevice(MiSwitch, {
    switch: 'switch.giot_cn_1009864570_v3oodm_on_p_2_1'
});
```

- `@State`：声明可控制状态，回调返回 `{ service, entityId }`（service 是 HA 风格：turn_on/turn_off/set_cover_position 等）。
- `$onEvent`：按 entityId 分发事件，`s` 是状态、`a` 是属性。
- 传给 `createDevice` 的 entity_id 必须用发现工具生成的值（精确匹配）。
- **不要**把 entity_id 写成 `$entityIds` 的类型字面量（如 `$entityIds: { switch: 'switch.xxx' }`），那会把类型钉死成单个字面量，且实例化时仍需 `createDevice` 传值。

## 6. 直连限制（重要）

- **非小米设备不支持**：无 HA 桥接，米家以外的设备（部分空调/扫地机等）无法接入。
- **本地 RPC 不可用**：中枢网关 hub1（xiaomi.gateway.hub1）不响应 `proxy/getDevList`，拿不到权威 `push_available`。框架用 `localip` 代理区分：有 localip（WiFi 设备）= 云端推送，无 = 本地推送。详见 `MI_GATEWAY_LOCAL_RPC.md`。
- **HA 在线时**：`miGatewayDirect: true` 的设备由 `usesMiGateway` 判断，直连就绪时只走直连、不收 HA 事件（避免双源重复）；直连未就绪回退 HA。
- **命令全走云端 HTTP**：本地 RPC 控制不通，命令经云端 API 下发（多一跳延迟，但稳）。这与官方集成不同——官方本地优先、本地不通才回退云端；本机网关上官方同样拿不到本地 RPC，实测也是全云端。
- **非小米设备的失效表现**：纯直连模式（无 HA）下所有 `@Device()` 默认标记直连，非小米设备的 entity_id 解析不出 did，启动日志会打 `[MiTranslator] 注册 direct 实体: N 成功, M 失败(did未解析)` 并列出样本；控制时打 `无法解析 entityId`。**设备表现为完全无响应**，看到这个先确认设备是否需要 HA 桥接，而不是去怀疑 entity_id 拼错。

## 7. 事件/命令路由（理解用）

- 状态广播：本地推送设备（无 localip）走本地网关 MQTT（`master/appMsg/notify/iot/#`）；WiFi 设备（有 localip）走云端 MQTT。
- 命令：全走云端 HTTP（`/app/v2/miotspec/prop/set`、`/action`）。
- 值映射（属性/事件/动作 <-> HA 事件/服务、单位换算、枚举翻译）复刻 ha_xiaomi_home；**控制路径不同**（见上）。

## 工作流

1. 用户 miLogin（若未做过）。
2. 跑 `discover-devices.mjs`，拿目标设备的 entity_id + 模板。
3. 按模板写 `@Device` 类（精简属性、补 `@State`/`$onEvent` 逻辑）。
4. 注册到 devices 目录，写自动化（`$onEvent` 里联动其他设备）。

