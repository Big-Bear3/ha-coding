/** MIoT 属性访问类型 */
export type MIoTAccess = 'read' | 'write' | 'notify';

/** MIoT 属性格式 */
export type MIoTFormat =
    | 'int'
    | 'uint8'
    | 'uint16'
    | 'uint32'
    | 'int8'
    | 'int16'
    | 'int32'
    | 'int64'
    | 'uint64'
    | 'float'
    | 'bool'
    | 'string';

/** MIoT spec 属性描述 */
export interface MIoTSpecProperty {
    iid: number;
    name: string;
    format: MIoTFormat;
    access: MIoTAccess[];
    unit?: string;
    valueRange?: [number, number, number];
    valueList?: { value: any; description: string; name: string }[];
    precision?: number;
    expr?: string;
    description?: string;
}

/** MIoT spec 事件描述 */
export interface MIoTSpecEvent {
    iid: number;
    name: string;
    description?: string;
    arguments: number[];
}

/** MIoT spec 动作描述 */
export interface MIoTSpecAction {
    iid: number;
    name: string;
    in: number[];
    out: number[];
}

/** MIoT spec 服务描述 */
export interface MIoTSpecService {
    iid: number;
    name: string;
    properties: MIoTSpecProperty[];
    events: MIoTSpecEvent[];
    actions: MIoTSpecAction[];
}

/** MIoT spec 实例（设备能力描述文档） */
export interface MIoTSpecInstance {
    urn: string;
    name: string;
    description?: string;
    services: MIoTSpecService[];
}

/** 设备列表项 */
export interface MiDeviceInfo {
    did: string;
    model: string;
    urn: string;
    online: boolean;
    name?: string;
    groupId?: string;
    /** 本地 IP（WiFi 设备有值，走云端推送；网关子设备为 null，走本地推送） */
    localIp?: string | null;
}

/** 属性推送 payload（本地中枢网关） */
export interface MiPropChange {
    did: string;
    siid: number;
    piid: number;
    value: any;
    ts?: number;
}

/** 事件推送 payload */
export interface MiEventChange {
    did: string;
    siid: number;
    eiid: number;
    arguments: { piid: number; value: any }[];
    ts?: number;
}

/** 设备上下线状态 */
export interface MiDevStatusChange {
    did: string;
    online: boolean;
}

/** entity_id 解析结果 */
export interface EntityIdParseResult {
    did: string;
    siid?: number;
    piid?: number;
    eiid?: number;
    aiid?: number;
    type: 'prop' | 'event' | 'action' | 'service' | 'device';
    domain: string;
}

/** OAuth 认证信息 */
export interface MiAuthInfo {
    access_token: string;
    refresh_token: string;
    expires_ts: number;
    uid?: string;
    redirect_uri?: string;
    device_id?: string;
}

/** 中枢网关 mDNS 发现结果 */
export interface MiGatewayInfo {
    host: string;
    port: number;
    groupId: string;
    did: string;
}

