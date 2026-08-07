# 小米中枢网关直连实现设计

## 1. 背景与目标

ha-coding 当前通过 Home Assistant 的 WebSocket/HTTP API 接入设备:状态来自 `subscribe_entities`,控制走 `call_service`。对于小米设备,链路为:

```
J.N 设备类 -> ha-coding -> HA WebSocket -> HA 小米集成(xiaomi_home) -> 中枢网关 -> 设备
```

HA 在这里只是一个转发中间件。本设计的目标是让 ha-coding **直接连接小米中枢网关**,去掉 HA 这一层:

```
J.N 设备类 -> ha-coding -> 中枢网关 -> 设备
```

## 2. 设计约束

| 约束                | 说明                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **全 Node.js 原生** | 直连逻辑全部用 TypeScript/Node.js 实现,不依赖 Python 桥接服务,ha-coding 自包含                                                                 |
| **J.N 零改动**      | J.N 的 `automation/*`、`devices-def/*`、`devices/*` 保持不变,设备类仍按 HA 概念写(`$entityIds`、`@State(callInfoGetter)`、`$onEvent(HAEvent)`) |
| **显式标记直连**    | 只有 `@Device({ miGatewayDirect: true })` 标记的设备类走直连,其余(包括未标记的小米设备)一律走 HA。不按 entity_id 自动识别                      |
| **可共存**          | 标记直连的设备走小米网关,其余走 HA,两者并行(非小米设备如功放/Aqara/美的仍走 HA)                                                                |

## 3. 总体架构

引入 `MiRouter`(设备控制路由),按 entityId 决定走 HA 还是小米网关。`MiRouter` 持有 `HADataSource` 和 `MiDataSource` 两个控制通道(普通类,无接口/implements)。

```
                        ┌─────────────────────────────────────┐
                        │   CallService / EventService        │  ← J.N 设备类、automation 在此之上,完全不动
                        └──────────────┬──────────────────────┘
                                       │ CallInfo 下发
                        ┌──────────────▼──────────────────────┐
                        │            MiRouter                  │  ← 按 entityId 路由(仅 miGatewayDirect 标记走直连)
                        └──┬───────────────────────────────┬───┘
                           │                               │
              未标记直连   │                               │  标记直连
              ┌────────────▼──────────┐        ┌───────────▼─────────────────┐
              │   HADataSource        │        │  MiDataSource                │
              │ (HA WebSocket call)   │        │  ┌───────────────────────┐  │
              │  HA call_service      │        │  │ MiTranslator          │  │  HA概念 ↔ MIoT
              └───────────────────────┘        │  │  entity_id 解析        │  │
                                               │  │  service -> set_prop   │  │
                                               │  │  sub_prop -> HAEvent   │  │
                                               │  └─────────┬─────────────┘  │
                                               │            │ did/siid/piid   │
                                               │  ┌─────────▼─────────────┐  │
                                               │  │ MiDeviceList(缓存)    │  │  did 解析兜底 + spec 入口
                                               │  │ MiSpecStore(spec缓存) │  │
                                               │  │ MiMqttService(mTLS)   │  │  MQTT 8883
                                               │  │ MiCertManager(OAuth)  │  │  证书/刷新
                                               │  │ MiMdns(发现网关)      │  │
                                               │  └───────────────────────┘  │
                                               └─────────────────────────────┘
```

### 现有框架的协议无关性

ha-coding 的核心引擎本就与 HA 解耦:

- **协议相关(边界)**:`HAWebsocketService`(状态源)、`CallService`(经 `MiRouter` 路由)、`EventService.handleEvent` -> `device.$onEvent`
- **协议无关(引擎)**:`StateManager`、`EffectManager`、`@Device`/`@State`/`@Action` 装饰器、`onChange`/`onKeep`/`onDetect`/`schedule`/`timer` 等

改造只动边界层,引擎不动,J.N 的 automation 一行不改。

## 4. 模块设计

### 4.1 MiRouter(`services/mi/mi-router.ts`)

设备控制路由。持有 `HADataSource` 和 `MiDataSource`,按 entityId 路由:

- `call(callInfo)`:若 `usesMiGateway(entityId)` 走 `MiDataSource`,否则走 `HADataSource`
- `usesMiGateway(entityId)`:仅当 `MiDataSource` 就绪且 `DeviceManager.isMiGatewayEntity(entityId)`(即 `@Device({ miGatewayDirect: true })` 标记)时返回 true。未标记的设备一律走 HA
- `miGatewayReady` / `haReady`:通道就绪状态(直连未就绪时标记设备也回退 HA)

不实现任何接口(TS 结构类型,无需 `implements`)。

### 4.2 `@Device({ miGatewayDirect: true })`(`decorators/device.ts`)

装饰器选项。标记该设备类走小米网关直连。调用 `DeviceManager.registerMiGatewayDirectDeviceDef(deviceDef)` 注册设备类(类型 `Class`,ha-coding 惯例)。

### 4.3 DeviceManager 扩展(`managers/device-manager.ts`)

- `#miGatewayDirectDeviceDefs: Set<Class>`:标记直连的设备类集合
- `#miGatewayEntityIds: Set<string>`:直连设备类的 entityId 集合
- `registerMiGatewayDirectDeviceDef(deviceDef)`:注册直连设备类
- `isMiGatewayEntity(entityId)`:entityId 是否属于直连设备
- `getAllEntityIds()`:所有已注册 entityId(供翻译层注册)
- `registerDevice` 时检查设备类是否在 `#miGatewayDirectDeviceDefs`,是则其 entityId 加入 `#miGatewayEntityIds`

### 4.4 HADataSource(`services/ha-data-source.ts`)

HA 控制通道。`call(callInfo)` 构造 `call_service` 消息经 `HAWebsocketService` 下发。普通类。

### 4.5 MiDataSource(`services/mi/mi-data-source.ts`)

小米网关控制通道。组合认证/发现/通信/设备列表/翻译层。普通类。

- `start(eventHandler)`:发现网关 -> mTLS 连接 -> 加载设备列表 -> 注册 direct entityId -> 订阅属性/事件
- `call(callInfo)`:经 `MiTranslator` 翻译后下发
- 只注册/推送 `miGatewayDirect` 标记设备的状态(非标记设备完全由 HA 推送,不冲突)

### 4.6 MiDataSource 内部模块

#### MiCertManager(`mi-cert-manager.ts`)

三层认证 + 凭证持久化 + 自动刷新。详见第 5 节。

#### MiMdns(`mi-mdns.ts`)

mDNS 扫描 `_miot-central._tcp.local.`,发现中枢网关 IP/端口/group_id/did。基于 `bonjour-service`。

#### MiMqttService(`mi-mqtt-service.ts`)

基于 `mqtt.js` 的 MQTT mTLS 通信(端口 8883,MQTT v5)。含 MIPS 二进制报文 pack/unpack(私有 TLV 协议)、RPC 请求/响应匹配(mid)、属性/事件广播分发。连接后用通配符订阅 `appMsg/notify/iot/#` 与 `master/appMsg/notify/iot/#`(等价于参考实现的 per-did sub_prop/subEvent),经 `onProp/onEvent` 回调分发;提供 `getProp/setProp/action/getDevList`。

#### MiDeviceList(`mi-device-list.ts`)

启动时 `getDevList` 拉取网关设备 `{did, model, urn, online}`,缓存。用于 did 解析兜底(BLE 设备 did 含点号)和 spec 入口。

#### MiSpecStore(`mi-spec-store.ts`)

用 `urn` 从 `miot-spec.org` 拉取设备能力描述(service/property/action 树),本地缓存。提供 `getSpecByDid/getSpecByUrn/findProperty/findService`。

#### MiTranslator(`mi-translator.ts`)

双向翻译 HA 概念 ↔ MIoT,J.N 零改动的关键。详见第 6 节。

#### entity-id-parser(`entity-id-parser.ts`)

解析 HA 小米 entity_id -> `{did, siid, piid/eiid/aiid, type}`。did 解析:设备列表匹配优先(覆盖 BLE),正则兜底(纯数字/群组)。

## 5. 认证流程实现(MiCertManager)

### 5.1 三层认证时序

```
首次登录(交互式,凭证持久化后免再登录):
  1. OAuth 2.0 授权码流程
     - 生成授权 URL: https://account.xiaomi.com/oauth2/authorize
       ?client_id=2882303761520251711&response_type=code
       &redirect_uri=http://homeassistant.local:8123/api/webhook/{virtualDid}&device_id=ha.{uuid}&state={sha1}
     - 用户浏览器登录小米账号并授权
     - 小米重定向到 redirect_uri(该地址可能打不开,正常)
     - 用户从浏览器地址栏复制跳转后的完整 URL,粘贴回控制台
     - 从 URL 提取 code
  2. 用 code 换 token
     GET https://ha.api.io.mi.com/app/v2/ha/oauth/get_token?data={...}
     -> { access_token, refresh_token, expires_in }
     -> expires_ts = now + expires_in * 0.7
  3. 通过 gethome 接口获取 uid(home['uid'])
  4. 本地生成 Ed25519 私钥(PEM PKCS8,首次) + CSR
     CSR subject: C=CN, O=Mijia Device, CN=mips.{uid}.{sha1(did).hex}.2
  5. 云端签发终端证书
     POST https://ha.api.io.mi.com/app/v2/ha/oauth/get_central_crt
     Headers: Authorization: Bearer{access_token}(无空格)、X-Client-BizId: haapi、X-Client-AppId: 2882303761520251711
     Body: { "csr": base64(csr_pem_utf8) }
     -> { result: { cert: "PEM终端证书" } }
  6. mTLS 连接中枢网关
     mqtts://{网关IP}:8883, MQTT v5, keepalive 60s
     ca = MIHOME_CA_CERT(两张: Mijia Root + MIOT CENTRAL GATEWAY CA)
     cert = 云端签发的终端证书, key = Ed25519 私钥
     clientId = virtual_did, 无 username/password, rejectUnauthorized=false

持续维护:
  - access_token 过期前用 refresh_token 刷新
  - 证书过期前 3 天复用私钥重新 CSR + 签发
  - refresh_token 过期才需重新 OAuth(需用户再次交互)
```

### 5.2 凭证持久化

复用 ha-coding 的 `localStorage`(`node-localstorage`,目录 `{cwd}/.localstorage/`),keys:

- `mi_auth_info`:{ access_token, refresh_token, expires_ts, uid, redirect_uri, device_id }
- `mi_user_key`:Ed25519 私钥 PEM
- `mi_user_cert`:终端证书 PEM
- `mi_virtual_did`、`mi_device_id`、`mi_uid`

### 5.3 Node.js 实现要点与依赖

| 功能                 | 库                                | 备注                                                                |
| -------------------- | --------------------------------- | ------------------------------------------------------------------- |
| HTTP                 | axios(ha-coding 已有)             | OAuth、签证书、gethome、spec                                        |
| Ed25519 密钥、SHA1   | node:crypto(内置)                 | `generateKeyPairSync`/WebCrypto                                     |
| **CSR 生成**         | **@peculiar/x509**                | Node 内置不支持创建 CSR,唯一非内置依赖                              |
| 证书解析(读过期时间) | node:crypto.X509Certificate(内置) | `validTo`                                                           |
| MQTT mTLS            | mqtt.js                           |                                                                     |
| mDNS                 | bonjour-service                   |                                                                     |
| **reflect-metadata** | reflect-metadata                  | **@peculiar/x509 依赖 tsyringe,tsyringe 运行时强制要求此 polyfill** |

### 5.4 必须照搬的实现细节

1. `Authorization: Bearer{token}` -- Bearer 与 token 间**无空格**
2. token 请求是 **GET**,参数 `data` 是 JSON 字符串放 query
3. **client_id 精度**:`2882303761520251711` 超过 JS Number 安全整数,`parseInt` 会丢精度导致 `invalid client`。手动拼接 JSON(`{"client_id":2882303761520251711,...}`)保证数字字面量精确
4. CSR 要 **UTF-8 字符串再 base64**,不是 DER base64
5. did_hash 用 **SHA1**(不是 SHA256),CN 末尾 `.2` 固定
6. CA 证书两张(Mijia Root + MIOT CENTRAL GATEWAY CA),缺一不可
7. **MQTT v5** + `rejectUnauthorized: false`
8. **WebCrypto Ed25519 算法名用 `'Ed25519'`**(Node 的非标准命名,不是规范的 `'EdDSA'`)
9. 证书刷新**复用私钥**,只有首次生成新 Ed25519 密钥
10. token 有效期按 **70%** 计算
11. **OAuth redirect_uri 小米只接受 `http://homeassistant.local:8123`**(注册值),无法用 localhost 回调,故采用手动复制授权码方式
12. 仅 cn 区支持中枢网关直连

## 6. 翻译层实现(MiTranslator)

### 6.1 MIoT 数据模型

小米 MIoT 用 `did + siid + piid/eiid/aiid + value` 四元组寻址:

- **property**:`{did, siid, piid, value}`(可读/写/订阅)
- **event**:`{did, siid, eiid, arguments: [{piid, value}]}`
- **action**:`{did, siid, aiid, in: [{piid, value}]}` -> `{code, out}`

设备能力由 spec 描述(service/property/action 树),spec 从 miot-spec.org 拉取。

### 6.2 entity_id 解析

entity_id 完整模板(xiaomi_home `miot_device.py`):

```
{platform}.{model0[:9]}_{did_tag}_{modelN[:20]}[_{spec_name}]_{type}_{siid}_{id}
                                ↑ did_tag = slugify('{cloud_server}_{did}')
```

cn 区 `did_tag = cn_{did}`。解析:

- 尾部 `_(p|e|a)_(\d+)_(\d+)$` 提取 type/siid/piid(eiid/aiid)
- did:设备列表匹配优先(覆盖 BLE 含点号 did),`cn_(\d+)`/`cn_group_(\d+)` 正则兜底
- 复合 entity(`_s_{siid}_*`)只有 siid,需 spec 推导各属性 piid

### 6.3 正向翻译:HA CallInfo -> MIoT 操作

J.N 设备类 `@State(callInfoGetter)` 生成 HA 格式 `CallInfo { entityId, service, serviceData }`。MiTranslator 翻译:

**简单 entity(entity_id 含 piid,直接)**:

| HA CallInfo                                                    | MIoT 操作                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `switch.turn_on/off`                                           | `setProp(did, siid, piid, true/false)`                    |
| `number.set_value` / `select.select_option` / `text.set_value` | `setProp(did, siid, piid, value)`                         |
| `button.press`                                                 | `action(did, siid, aiid, [])`                             |
| `notify.xxx {message}`                                         | `action(did, siid, aiid, parseInList(message, spec.in_))` |

**复合 entity(`_s_X_*`,需 spec 推 piid)**:

| HA CallInfo                         | MIoT 操作(查 spec 找 piid)                    |
| ----------------------------------- | --------------------------------------------- |
| `light.turn_on` 无参                | `setProp(did, siid, on_piid, true)`           |
| `light.turn_on {brightness_pct}`    | `setProp(did, siid, brightness_piid, value)`  |
| `light.turn_on {color_temp_kelvin}` | `setProp(did, siid, color_temp_piid, value)`  |
| `light.turn_off`                    | `setProp(did, siid, on_piid, false)`          |
| `cover.set_cover_position`          | `setProp(did, siid, position_piid, value)`    |
| `climate.set_temperature`           | `setProp(did, siid, target_temp_piid, value)` |

### 6.4 反向翻译:MIoT 推送 -> HAEvent

MiMqttService 通过通配符订阅收到属性/事件广播,MiTranslator 包装成 `HAEvent { s, a, lc }` 喂给 `device.$onEvent`:

- 简单 property:`{did, siid, piid, value}` -> 查反向映射得 entityId -> `HAEvent { s: value?'on':'off' }`(switch)或 `{ s: value }`(sensor)
- 复合 property(灯):`on` piid -> `{s:'on'/'off'}`;`brightness` piid -> `{s:'on', a:{brightness: round(value*2.55)}}`(0-100 -> 0-255);`color-temperature` -> `{s:'on', a:{color_temp_kelvin: value}}`
- 事件:`{did, siid, eiid, arguments}` -> 触发对应 event entity 的 `$onEvent`(J.N 的 `MiButton` 按 entityId 匹配;`MiCentralGateway` 读 `a['事件名称']`)

> brightness 0-100 ↔ 0-255 转换复刻 HA 小米集成规则,否则 J.N 设备类的转换对不上。

### 6.5 翻译覆盖范围(J.N 用到的 domain)

| domain                                                   | 类型        | 翻译难度               |
| -------------------------------------------------------- | ----------- | ---------------------- |
| switch / sensor / binary_sensor / number / select / text | 简单(_p_)   | 低                     |
| button / notify                                          | action(_a_) | 低                     |
| event                                                    | event(_e_)  | 低                     |
| light / cover / climate / humidifier                     | 复合(_s_)   | 中(需 spec)            |
| media_player(小爱)                                       | 特殊        | 中(播放/TTS 走 action) |

## 7. 配置

无运行时模式配置。路由行为固定:`@Device({ miGatewayDirect: true })` 标记的设备走直连,其余走 HA。

唯一的配置是 OAuth 回调地址,但小米只接受注册值 `http://homeassistant.local:8123`,因此在 [config.ts](src/config/config.ts) 中**硬编码** `MI_OAUTH_REDIRECT_URL = 'http://homeassistant.local:8123'`,不可配(配了也无效)。

首次使用需调一次 `miLogin()`(从 `ha-coding` 导出,无参)完成 OAuth 登录,凭证持久化后后续启动自动加载、自动刷新。

## 8. J.N 零改动保证

J.N 不需要任何改动即可运行(automation / devices-def / devices 全部保持 HA 概念写法)。要让某设备类走直连,只需:

```ts
@Device({ miGatewayDirect: true })
export class MiSwitch implements DeviceDef { ... }
```

加了标记的类,其所有实例的控制和状态走小米中枢网关;没加的继续走 HA。可逐个类迁、逐个验证。

唯一例外:`sendNotification`(ha-coding API)内部已自动判断:目标 entityId 属直连设备则走 MIoT action,否则走 HA execute_script。J.N 调用方式不变。

## 9. 实现状态

模块实现完成并编译通过(`tsc --noEmit`),J.N 已直连本地 ha-coding 开发(Junction 指向 `.dist`)。已验证:

- ✅ OAuth 登录(手动授权码)+ token 换取 + uid 获取 + Ed25519 密钥/CSR + 云端签证书(凭证持久化)
- ⏳ MQTT mTLS 连接 + 设备列表 + 单设备端到端(待真实环境联调)

联调验证点:MIPS 二进制协议字节序、spec property name 映射、brightness 单位转换、小爱 action。

## 10. 依赖与风险

### 新增依赖

| 依赖               | 用途                                           | 必需                |
| ------------------ | ---------------------------------------------- | ------------------- |
| `mqtt`             | MQTT 客户端                                    | 是                  |
| `@peculiar/x509`   | CSR 生成(Ed25519)                              | 是(Node 内置不支持) |
| `bonjour-service`  | mDNS 发现                                      | 是                  |
| `reflect-metadata` | @peculiar/x509 依赖 tsyringe 的运行时 polyfill | 是                  |

其余(Ed25519/SHA1/证书解析/HTTP)用 Node 内置或 ha-coding 已有库。

### 风险与对策

| 风险                                       | 对策                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| BLE 设备 did 含点号,entity_id 纯解析不可靠 | MiDeviceList 匹配兜底                                              |
| spec 依赖 miot-spec.org 公网               | 本地缓存,首次拉取后离线可用                                        |
| 小爱语音可能涉及米家云端接口               | 单独验证,必要时保留走云端                                          |
| HA 单位/格式转换未完全复刻                 | 翻译层照 xiaomi_home 实现 brightness/色温等转换                    |
| xiaomi_home license 限定(仅 HA 非商业)     | 协议与映射逻辑参考,代码独立实现                                    |
| OAuth 首次需浏览器交互 + 手动复制授权码    | 一次性,后续自动刷新;redirect_uri 小米限定 homeassistant.local:8123 |

## 11. 参考来源

- entity*id 生成:xiaomi_home `miot/miot_device.py`(gen*\*\_entity_id)、`miot/common.py`(slugify_did)
- 认证流程:`miot/miot_cloud.py`、`miot/miot_storage.py`(gen_user_key/gen_user_csr/did_hash)、`miot/miot_client.py`(刷新)、`miot/const.py`(client_id/CA 证书)
- MQTT 通信:`miot/miot_mips.py`(MipsLocalClient、\_MipsMessage pack/unpack、mTLS、sub_prop/set_prop/action/get_dev_list)
- MIoT -> HA 映射:`miot/miot_device.py`(spec_transform)、`miot/specs/specv2entity.py`
- notify 实现:`notify.py`、`miot/miot_device.py`(action_async)

