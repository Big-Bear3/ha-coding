/** 小米中枢网关直连相关常量 */

/** OAuth 2.0 客户端 ID（小米 HA 集成注册，不可更改） */
export const MI_OAUTH2_CLIENT_ID = '2882303761520251711';

/** OAuth 2.0 授权地址 */
export const MI_OAUTH2_AUTH_URL = 'https://account.xiaomi.com/oauth2/authorize';

/** 小米 HA 云端 API 主机 */
export const MI_OAUTH2_API_HOST = 'ha.api.io.mi.com';

/** 小米云端 MQTT Broker 主机 */
export const MI_CLOUD_BROKER_HOST = 'ha.mqtt.io.mi.com';

/** HTTP API 超时（秒） */
export const MI_HTTP_API_TIMEOUT = 30;

/** MQTT keepalive（秒） */
export const MI_MQTT_KEEPALIVE = 60;

/** 证书过期前 3 天刷新 */
export const MI_CERT_EXPIRE_MARGIN = 3600 * 24 * 3;

/** token 有效期按 70% 计算，留出刷新窗口 */
export const MI_TOKEN_EXPIRES_RATIO = 0.7;

/** token 剩余 60 秒时触发刷新 */
export const MI_TOKEN_REFRESH_THRESHOLD = 60;

/** 证书剩余 60 秒（扣除 margin 后）时触发刷新 */
export const MI_CERT_REFRESH_THRESHOLD = 60;

/** 仅 cn 区支持中枢网关本地控制 */
export const MI_SUPPORT_CENTRAL_GATEWAY_CTRL = ['cn'];

/** 中枢网关 mDNS 服务类型 */
export const MI_CENTRAL_GATEWAY_MDNS_TYPE = '_miot-central._tcp.local.';

/** 中枢网关 MQTT 端口 */
export const MI_CENTRAL_GATEWAY_PORT = 8883;

/**
 * spec 缓存结构版本（对应 ha_xiaomi_home MIoTSpecParser.VERSION）。
 *
 * **修改 MiSpecStore.parseSpec / applyTranslations / dedupValueListDescriptions 的产出结构或语义时，
 * 必须递增此值**，否则旧缓存会被继续使用，改动对已有安装不生效（无需用户手删 .localstorage）。
 *
 * 变更历史：
 * - 1: 初版（iid/name/format/access/unit/valueRange/valueList/precision）
 * - 2: 新增 description、expr、valueList[].name、precision 从 step 推断、valueList description 去重
 */
export const MI_SPEC_CACHE_VERSION = 2;

/** spec 缓存有效期（秒），14 天，与官方 SPEC_STD_LIB_EFFECTIVE_TIME 一致 */
export const MI_SPEC_CACHE_TTL = 3600 * 24 * 14;

/** MIoT spec 拉取地址 */
export const MI_SPEC_API_URL = 'https://miot-spec.org/miot-spec-v2/instance';

/** MIoT spec 多语言翻译地址（复刻 ha_xiaomi_home __get_multi_lang_async） */
export const MI_SPEC_MULTI_LANG_API_URL = 'https://miot-spec.org/instance/v2/multiLanguage';

/** OAuth 回调本地服务路径 */
export const MI_OAUTH_CALLBACK_PATH = '/mi/oauth/callback';

/** 小米根 CA 证书（Mijia Root + MIOT CENTRAL GATEWAY CA，mTLS 校验链） */
export const MIHOME_CA_CERT_STR = `-----BEGIN CERTIFICATE-----
MIIBazCCAQ+gAwIBAgIEA/UKYDAMBggqhkjOPQQDAgUAMCIxEzARBgNVBAoTCk1p
amlhIFJvb3QxCzAJBgNVBAYTAkNOMCAXDTE2MTEyMzAxMzk0NVoYDzIwNjYxMTEx
MDEzOTQ1WjAiMRMwEQYDVQQKEwpNaWppYSBSb290MQswCQYDVQQGEwJDTjBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABL71iwLa4//4VBqgRI+6xE23xpovqPCxtv96
2VHbZij61/Ag6jmi7oZ/3Xg/3C+whglcwoUEE6KALGJ9vccV9PmjLzAtMAwGA1Ud
EwQFMAMBAf8wHQYDVR0OBBYEFJa3onw5sblmM6n40QmyAGDI5sURMAwGCCqGSM49
BAMCBQADSAAwRQIgchciK9h6tZmfrP8Ka6KziQ4Lv3hKfrHtAZXMHPda4IYCIQCG
az93ggFcbrG9u2wixjx1HKW4DUA5NXZG0wWQTpJTbQ==
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIBjzCCATWgAwIBAgIBATAKBggqhkjOPQQDAjAiMRMwEQYDVQQKEwpNaWppYSBS
b290MQswCQYDVQQGEwJDTjAgFw0yMjA2MDkxNDE0MThaGA8yMDcyMDUyNzE0MTQx
OFowLDELMAkGA1UEBhMCQ04xHTAbBgNVBAoMFE1JT1QgQ0VOVFJBTCBHQVRFV0FZ
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEdYrzbnp/0x/cZLZnuEDXTFf8mhj4
CVpZPwgj9e9Ve5r3K7zvu8Jjj7JF1JjQYvEC6yhp1SzBgglnK4L8xQzdiqNQME4w
HQYDVR0OBBYEFCf9+YBU7pXDs6K6CAQPRhlGJ+cuMB8GA1UdIwQYMBaAFJa3onw5
sblmM6n40QmyAGDI5sURMAwGA1UdEwQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIh
AKUv+c8v98vypkGMTzMwckGjjVqTef8xodsy6PhcSCq+AiA/n9mDs62hAo5zXyJy
Bs1s7mqXPf1XgieoxIvs1MqyiA==
-----END CERTIFICATE-----
`;

