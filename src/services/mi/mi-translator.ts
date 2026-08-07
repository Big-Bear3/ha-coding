import { logger } from '../logger-service.js';
import { MiCloudHttp } from './mi-cloud-http.js';
import { MiSpecStore } from './mi-spec-store.js';
import { parseEntityId } from './entity-id-parser.js';
import { DeviceManager } from '../../managers/device-manager.js';
import type { CallInfo } from '../call-service.js';
import type { HAEvent } from '../../types/ha-types.js';
import type {
    EntityIdParseResult,
    MiPropChange,
    MiEventChange,
    MIoTSpecInstance,
    MIoTSpecProperty,
    MIoTSpecAction
} from './mi-types.js';

function nowTs(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * 有序档位序号 -> HA percentage（复刻 HA homeassistant.util.percentage
 * ordered_list_item_to_percentage: ceil((index + 1) * 100 / count)）。
 * 3 档 -> 34/67/100，末档必须正好 100。
 */
function orderedListIndexToPercentage(index: number, count: number): number {
    if (count <= 0) return 0;
    const i = Math.min(Math.max(index, 0), count - 1);
    return Math.ceil(((i + 1) * 100) / count);
}

/**
 * HA percentage -> 有序档位序号（复刻 HA percentage_to_ordered_list_item：
 * 找第一个 ordered_list_item_to_percentage(i) >= percentage 的档位）。
 * 与 orderedListIndexToPercentage 互为逆运算（percentage 落在档位边界值上时）。
 */
function percentageToOrderedListIndex(percentage: number, count: number): number {
    if (count <= 0) return 0;
    for (let i = 0; i < count; i++) {
        if (orderedListIndexToPercentage(i, count) >= percentage) return i;
    }
    return count - 1;
}

/**
 * MIoT mode 枚举名（英文 slug） -> HA HVACMode（复刻 ha_xiaomi_home climate.py:519）。
 * 官方按 item.name 匹配，不是按 description——description 会被 multi_lang 翻成中文。
 */
const HVAC_MODE_MAP: Record<string, string> = {
    off: 'off',
    idle: 'off',
    auto: 'auto',
    cool: 'cool',
    heat: 'heat',
    dry: 'dry',
    fan: 'fan_only',
    heat_cool: 'heat_cool'
};

/**
 * cover status 枚举名分类（1:1 复刻 ha_xiaomi_home cover.py:166-182）。
 * 官方用集合精确匹配 `re.sub(r'[^a-z]', '', item.name)`，不是子串匹配。
 */
const COVER_STATUS_OPENING = new Set(['opening', 'open', 'up', 'uping', 'rise', 'rising']);
const COVER_STATUS_CLOSING = new Set([
    'closing',
    'close',
    'down',
    'dowm', // 官方保留的上游拼写错误
    'falling',
    'fallin',
    'dropping',
    'downing',
    'lower'
]);
const COVER_STATUS_CLOSED = new Set([
    'closed',
    'closeover',
    'stopatlowest',
    'stoplowerlimit',
    'lowerlimitstop',
    'floor',
    'lowerlimit'
]);

/**
 * 无 mode 属性的 climate 设备，on=true 时的 hvac_mode
 * （复刻 ha_xiaomi_home climate.py：Heater/ElectricBlanket -> HEAT, Thermostat -> AUTO）。
 */
const CLIMATE_ON_HVAC_MODE: Record<string, string> = {
    heater: 'heat',
    'electric-blanket': 'heat',
    thermostat: 'auto'
};

/** RGB(0-255) -> [hue(0-360), saturation(0-100)] */
function rgbToHs(r: number, g: number, b: number): [number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : (d / max) * 100;
    return [Math.round(h), Math.round(s)];
}

/** HA 概念 ↔ MIoT 翻译层，使 J.N 设备类保持 HA 写法不变 */
export class MiTranslator {
    static #instance: MiTranslator;

    #cloud = MiCloudHttp.instance;

    #spec = MiSpecStore.instance;

    #entityMap = new Map<string, EntityIdParseResult>();

    #reversePropMap = new Map<string, string>();

    #reverseEventMap = new Map<string, string>();

    #specCache = new Map<string, MIoTSpecInstance>();

    /** 合成事件回发通道（callCover 合成 opening/closing 等命令衍生事件用） */
    #eventHandler: ((entityId: string, event: HAEvent) => void) | null = null;

    /** cover 当前位置缓存（did -> HA position 0-100），无 status 属性的 cover 据此判断命令方向 */
    #coverPos = new Map<string, number>();

    /**
     * climate 摆风状态缓存（`${did}_${siid}` -> 水平/垂直最后已知值）。
     * 官方 swing_mode 由两个属性联合判定，我们逐属性推送，需缓存另一侧才能还原 both/horizontal/vertical。
     */
    #swingState = new Map<string, { horizontal?: boolean; vertical?: boolean }>();

    private constructor() {}

    /** 注入事件回发通道（mi-data-source 启动时调用） */
    setEventHandler(handler: (entityId: string, event: HAEvent) => void): void {
        this.#eventHandler = handler;
    }

    /** 回发合成事件（仅 direct 实体） */
    private emitEvent(entityId: string, event: HAEvent): void {
        if (this.#eventHandler && DeviceManager.instance.isMiGatewayEntity(entityId)) {
            this.#eventHandler(entityId, event);
        }
    }

    /** 注册 entityId，建立正反向映射 */
    registerEntity(entityId: string): void {
        const parsed = parseEntityId(entityId);
        if (!parsed?.did) return;
        // _s_ 复合实体：siid 有值但 piid 为 null，标记为 service 类型
        if (parsed.siid != null && parsed.piid == null && parsed.eiid == null && parsed.aiid == null) {
            parsed.type = 'service';
        }
        // 设备级实体（无 siid 后缀）同样标记为 service，等 call 时再从 spec 补
        if (parsed.siid == null) {
            parsed.type = 'service';
        }
        this.#entityMap.set(entityId, parsed);
        if (parsed.piid != null && parsed.siid != null) {
            this.#reversePropMap.set(`${parsed.did}_${parsed.siid}_${parsed.piid}`, entityId);
        }
        if (parsed.eiid != null && parsed.siid != null) {
            this.#reverseEventMap.set(`${parsed.did}_${parsed.siid}_${parsed.eiid}`, entityId);
        }
    }

    /** 批量注册 */
    registerEntities(entityIds: string[]): void {
        let ok = 0;
        let fail = 0;
        const failedSamples: string[] = [];
        for (const entityId of entityIds) {
            const parsed = parseEntityId(entityId);
            if (!parsed?.did) {
                fail++;
                if (failedSamples.length < 3) failedSamples.push(entityId);
                continue;
            }
            // 设备级实体（无 _s_ 后缀，siid 为 null）：按 service 注册，siid 在 call/propToEvent 时从 spec 补
            if (parsed.siid == null) {
                parsed.type = 'service';
            }
            this.#entityMap.set(entityId, parsed);
            if (parsed.piid != null && parsed.siid != null) {
                this.#reversePropMap.set(`${parsed.did}_${parsed.siid}_${parsed.piid}`, entityId);
            }
            if (parsed.eiid != null && parsed.siid != null) {
                this.#reverseEventMap.set(`${parsed.did}_${parsed.siid}_${parsed.eiid}`, entityId);
            }
            ok++;
        }
        logger.print(`[MiTranslator] 注册 direct 实体: ${ok} 成功, ${fail} 失败(did未解析)`);
        if (failedSamples.length) {
            logger.printWarn(`[MiTranslator] 失败样本: ${failedSamples.join(', ')}`);
        }
    }

    /** 预拉 direct 设备的 spec 填充缓存，使状态回传的 wrapComposite 能同步读到 */
    async prefillSpec(entityIds: string[]): Promise<void> {
        const dids = new Set<string>();
        for (const entityId of entityIds) {
            const parsed = this.#entityMap.get(entityId);
            if (parsed?.did) dids.add(parsed.did);
        }
        await Promise.all(Array.from(dids).map((did) => this.getSpec(did)));
    }

    // ============ 正向：CallInfo -> MIoT 操作 ============

    async call(callInfo: CallInfo): Promise<void> {
        const parsed = this.#entityMap.get(callInfo.entityId) ?? parseEntityId(callInfo.entityId);
        if (!parsed?.did) {
            logger.printWarn(`[MiTranslator] 无法解析 entityId: ${callInfo.entityId}`);
            return;
        }
        // 设备级实体（无 siid 后缀）：从 spec 按 domain 反查 service siid
        if (parsed.siid == null) {
            const spec = await this.getSpec(parsed.did);
            parsed.siid = this.findServiceSiidByDomain(spec, parsed.domain);
            if (parsed.siid == null) {
                logger.printWarn(`[MiTranslator] 无法确定 service siid: ${callInfo.entityId} (domain=${parsed.domain})`);
                return;
            }
            this.#entityMap.set(callInfo.entityId, parsed);
        }
        const { did, siid, domain } = parsed;
        const service = callInfo.service;
        const data = callInfo.serviceData ?? {};

        try {
            switch (domain) {
                case 'switch': {
                    const swSpec = await this.getSpec(did);
                    const swProp = this.findPropByPiid(swSpec, siid, parsed.piid!);
                    if (service === 'toggle') {
                        const current = await this.#cloud.getProp(did, siid, parsed.piid!);
                        if (swProp) await this.setPropConverted(swProp, did, siid, !current);
                        else await this.#cloud.setProp(did, siid, parsed.piid!, !current);
                    } else {
                        if (swProp) await this.setPropConverted(swProp, did, siid, service === 'turn_on');
                        else await this.#cloud.setProp(did, siid, parsed.piid!, service === 'turn_on');
                    }
                    break;
                }
                case 'fan':
                    await this.callFan(did, siid, service, data, parsed.piid!);
                    break;
                case 'light':
                    await this.callLight(did, siid, service, data);
                    break;
                case 'cover': {
                    const synth = await this.callCover(did, siid, service, data);
                    if (synth) this.emitEvent(callInfo.entityId, synth);
                    break;
                }
                case 'climate':
                    await this.callClimate(did, siid, service, data);
                    break;
                case 'humidifier':
                    await this.callHumidifier(did, siid, service, data);
                    break;
                case 'number':
                case 'text': {
                    const numSpec = await this.getSpec(did);
                    const numProp = this.findPropByPiid(numSpec, siid, parsed.piid!);
                    if (numProp) await this.setPropConverted(numProp, did, siid, data.value);
                    else await this.#cloud.setProp(did, siid, parsed.piid!, data.value);
                    break;
                }
                case 'select': {
                    const selectSpec = await this.getSpec(did);
                    const selectProp = this.findPropByPiid(selectSpec, siid, parsed.piid!);
                    await this.#cloud.setProp(did, siid, parsed.piid!, this.mapValueList(selectProp, data.option));
                    break;
                }
                case 'button':
                    if (parsed.aiid != null) await this.#cloud.action(did, siid, parsed.aiid, []);
                    break;
                case 'notify':
                    if (parsed.aiid != null) await this.execNotify(did, siid, parsed.aiid, data.message ?? '');
                    break;
                case 'media_player':
                    await this.callMediaPlayer(did, siid, service, data);
                    break;
                case 'vacuum':
                    await this.callVacuum(did, siid, service, data);
                    break;
                case 'water_heater':
                    await this.callWaterHeater(did, siid, service, data);
                    break;
                default:
                    if (parsed.piid != null && data.value !== undefined) {
                        const defSpec = await this.getSpec(did);
                        const defProp = this.findPropByPiid(defSpec, siid, parsed.piid);
                        if (defProp) await this.setPropConverted(defProp, did, siid, data.value);
                        else await this.#cloud.setProp(did, siid, parsed.piid, data.value);
                    }
            }
        } catch (error) {
            logger.printError(`[MiTranslator] call 失败: ${callInfo.entityId}.${service}`);
            logger.printError(error);
        }
    }

    private async callLight(did: string, siid: number, service: string, data: any): Promise<void> {
        const spec = await this.getSpec(did);
        if (service === 'turn_off') {
            const p = this.findProp(spec, siid, 'on');
            if (p) await this.setPropConverted(p, did, siid, false);
            return;
        }
        if (service === 'turn_on') {
            const onP = this.findProp(spec, siid, 'on');
            if (onP) await this.setPropConverted(onP, did, siid, true);
            // brightness: 支持 brightness(0-255) 和 brightness_pct(0-100)，按 valueRange 缩放（复刻 ha_xiaomi_home light.py）
            if (data.brightness != null || data.brightness_pct != null) {
                const p = this.findProp(spec, siid, 'brightness', 'brightness-level');
                if (p) {
                    const haVal = data.brightness != null ? data.brightness : data.brightness_pct;
                    const haMax = data.brightness != null ? 255 : 100;
                    const val = p.valueRange ? this.scaleToRange(haVal, haMax, p.valueRange) : haVal;
                    await this.setPropConverted(p, did, siid, val);
                }
            }
            if (data.color_temp_kelvin != null) {
                const p = this.findProp(spec, siid, 'color-temperature');
                if (p) await this.setPropConverted(p, did, siid, this.scaleColorTemp(p, data.color_temp_kelvin));
            }
            // RGB: 优先打包成 color int（复刻 ha_xiaomi_home light.py），fallback hue/saturation
            if (data.rgb_color != null) {
                const colorP = this.findProp(spec, siid, 'color');
                if (colorP) {
                    const [r, g, b] = data.rgb_color;
                    await this.setPropConverted(colorP, did, siid, (r << 16) | (g << 8) | b);
                } else {
                    const hueP = this.findProp(spec, siid, 'hue');
                    const satP = this.findProp(spec, siid, 'saturation');
                    if (hueP && satP) {
                        const [h, s] = rgbToHs(data.rgb_color[0], data.rgb_color[1], data.rgb_color[2]);
                        await this.setPropConverted(hueP, did, siid, h);
                        await this.setPropConverted(satP, did, siid, s);
                    }
                }
            } else if (data.hs_color != null) {
                const hueP = this.findProp(spec, siid, 'hue');
                const satP = this.findProp(spec, siid, 'saturation');
                if (hueP) await this.setPropConverted(hueP, did, siid, data.hs_color[0]);
                if (satP) await this.setPropConverted(satP, did, siid, data.hs_color[1]);
            }
            if (data.effect != null) {
                const p = this.findProp(spec, siid, 'mode', 'effect');
                if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.effect));
            }
        }
    }

    private async callFan(did: string, siid: number, service: string, data: any, onPiid: number): Promise<void> {
        const spec = await this.getSpec(did);
        const onProp = this.findPropByPiid(spec, siid, onPiid);
        if (service === 'turn_on' || service === 'turn_off') {
            const val = service === 'turn_on';
            if (onProp) await this.setPropConverted(onProp, did, siid, val);
            else await this.#cloud.setProp(did, siid, onPiid, val);
            if (service === 'turn_on') {
                if (data.percentage != null) await this.setFanLevel(spec, did, siid, data.percentage);
                if (data.preset_mode != null) {
                    const p = this.findProp(spec, siid, 'mode', 'fan-mode');
                    if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.preset_mode));
                }
            }
        } else if (service === 'set_percentage') {
            if (data.percentage === 0) {
                if (onProp) await this.setPropConverted(onProp, did, siid, false);
                else await this.#cloud.setProp(did, siid, onPiid, false);
            } else {
                if (onProp) await this.setPropConverted(onProp, did, siid, true);
                else await this.#cloud.setProp(did, siid, onPiid, true);
                await this.setFanLevel(spec, did, siid, data.percentage);
            }
        } else if (service === 'set_preset_mode') {
            const p = this.findProp(spec, siid, 'mode', 'fan-mode');
            if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.preset_mode));
        } else if (service === 'toggle') {
            const current = await this.#cloud.getProp(did, siid, onPiid);
            if (onProp) await this.setPropConverted(onProp, did, siid, !current);
            else await this.#cloud.setProp(did, siid, onPiid, !current);
        } else if (service === 'set_direction') {
            // wind-reverse: bool 格式 forward=false/reverse=true；valueList 格式按 name 匹配（复刻 ha_xiaomi_home fan.py）
            const p = this.findProp(spec, siid, 'wind-reverse');
            if (p) {
                if (p.format === 'bool') {
                    await this.setPropConverted(p, did, siid, data.direction === 'reverse');
                } else {
                    await this.setPropConverted(p, did, siid, this.mapValueList(p, data.direction));
                }
            }
        } else if (service === 'oscillate') {
            const p = this.findProp(spec, siid, 'horizontal-swing');
            if (p) await this.setPropConverted(p, did, siid, data.oscillating);
        }
    }

    /** fan percentage(0-100) -> 设备 fan-level（按 valueRange 或 valueList 缩放，复刻 ha_xiaomi_home fan.py） */
    private async setFanLevel(spec: MIoTSpecInstance, did: string, siid: number, percentage: number): Promise<void> {
        const p = this.findProp(spec, siid, 'fan-level', 'percentage', 'speed-level');
        if (!p) return;
        if (p.valueRange) {
            await this.setPropConverted(p, did, siid, this.scaleToRange(percentage, 100, p.valueRange));
        } else if (p.valueList && p.valueList.length > 0) {
            const idx = percentageToOrderedListIndex(percentage, p.valueList.length);
            await this.setPropConverted(p, did, siid, p.valueList[idx].value);
        } else {
            await this.setPropConverted(p, did, siid, percentage);
        }
    }

    private async callCover(did: string, siid: number, service: string, data: any): Promise<HAEvent | null> {
        const spec = await this.getSpec(did);
        if (service === 'set_cover_position') {
            const p = this.findProp(spec, siid, 'target-position');
            if (p) {
                const val = p.valueRange ? this.scaleCoverToRange(data.position, p.valueRange) : data.position;
                await this.setPropConverted(p, did, siid, val);
            }
        } else if (service === 'set_tilt_position') {
            const p = this.findProp(spec, siid, 'tilt-angle', 'current-tilt');
            if (p) {
                const val = p.valueRange ? this.scaleCoverToRange(data.tilt_position, p.valueRange) : data.tilt_position;
                await this.setPropConverted(p, did, siid, val);
            }
        } else if (service === 'open_cover' || service === 'close_cover' || service === 'stop_cover') {
            // 优先 motor-control valueList（复刻 ha_xiaomi_home cover.py）
            const mcP = this.findProp(spec, siid, 'motor-control');
            if (mcP) {
                // 复刻 ha_xiaomi_home cover.py: open/up, close/down, pause/stop
                const action = service === 'open_cover' ? 'open' : service === 'close_cover' ? 'close' : 'pause';
                const val =
                    this.mapValueList(mcP, action) ??
                    this.mapValueList(mcP, service === 'open_cover' ? 'up' : service === 'close_cover' ? 'down' : 'stop');
                await this.setPropConverted(mcP, did, siid, val);
            } else {
                const posP = this.findProp(spec, siid, 'target-position');
                if (service === 'stop_cover') {
                    await this.runAction(spec, did, siid, 'stop', 'pause');
                } else if (posP) {
                    const val =
                        service === 'open_cover'
                            ? posP.valueRange
                                ? posP.valueRange[1]
                                : 100
                            : posP.valueRange
                              ? posP.valueRange[0]
                              : 0;
                    await this.setPropConverted(posP, did, siid, val);
                } else {
                    await this.runAction(spec, did, siid, service === 'open_cover' ? 'open' : 'close');
                }
            }
        }

        // 无 status 属性的 cover：opening/closing 无法从广播获得，按命令方向合成
        // （复刻 ha_xiaomi_home cover.py: 无 status 时用 _prop_pos_opening/_prop_pos_closing，
        //   async_open_cover 在 set_property_async 前置位，set_property_async 随即 async_write_ha_state 触发 state_changed）
        const statusP = this.findProp(spec, siid, 'status');
        if (statusP) {
            return null; // 有 status 属性，opening/closing 由 status 广播驱动
        }
        const current = this.#coverPos.get(did);
        let synth: HAEvent | null = null;
        if (service === 'open_cover') {
            // 复刻 async_open_cover: current < max 才置 opening
            if (current != null && current < 100) {
                synth = { s: 'opening' as any, a: {} as any, c: '', lc: nowTs() };
            }
        } else if (service === 'close_cover') {
            // 复刻 async_close_cover: current > min 才置 closing
            if (current != null && current > 0) {
                synth = { s: 'closing' as any, a: {} as any, c: '', lc: nowTs() };
            }
        } else if (service === 'set_cover_position') {
            // 复刻 async_set_cover_position: pos > current 置 opening, pos < current 置 closing
            const target = data?.position;
            if (current != null && target != null) {
                if (target > current) synth = { s: 'opening' as any, a: {} as any, c: '', lc: nowTs() };
                else if (target < current) synth = { s: 'closing' as any, a: {} as any, c: '', lc: nowTs() };
            }
        }
        return synth;
    }

    private async callClimate(did: string, siid: number, service: string, data: any): Promise<void> {
        const spec = await this.getSpec(did);
        const svc = spec?.services.find((s) => s.iid === siid);
        const svcName = svc?.name ?? '';
        if (service === 'set_temperature') {
            if (data.temperature != null) {
                const p = this.findProp(spec, siid, 'target-temperature');
                if (p) await this.setPropConverted(p, did, siid, data.temperature);
            }
            if (data.hvac_mode != null) {
                await this.setClimateMode(spec, did, siid, svcName, data.hvac_mode);
            }
        } else if (service === 'set_hvac_mode') {
            await this.setClimateMode(spec, did, siid, svcName, data.hvac_mode);
        } else if (service === 'set_fan_mode') {
            if (data.fan_mode === 'on' || data.fan_mode === 'off') {
                const onP = this.findProp(spec, siid, 'on');
                if (onP) await this.setPropConverted(onP, did, siid, data.fan_mode === 'on');
            } else {
                // 官方限定 fan-level 只取 fan-control / thermostat 服务下的同名属性
                // （climate.py:238），避免匹配到其它服务的 fan-level
                const p =
                    svcName === 'fan-control' || svcName === 'thermostat'
                        ? this.findProp(spec, siid, 'fan-level', 'fan-mode')
                        : (this.findProp(spec, siid, 'fan-mode') ?? this.findProp(spec, siid, 'fan-level'));
                if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.fan_mode));
            }
        } else if (service === 'set_swing_mode') {
            // 复刻 ha_xiaomi_home climate.py: vertical/horizontal/both/off
            const vP = this.findProp(spec, siid, 'vertical-swing', 'swing');
            const hP = this.findProp(spec, siid, 'horizontal-swing');
            const isBoth = data.swing_mode === 'both';
            const isV = isBoth || data.swing_mode === 'vertical';
            const isH = isBoth || data.swing_mode === 'horizontal';
            if (vP) await this.setPropConverted(vP, did, siid, isV);
            if (hP) await this.setPropConverted(hP, did, siid, isH);
        } else if (service === 'set_preset_mode') {
            const p = this.findProp(spec, siid, 'mode', 'heat-level');
            if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.preset_mode));
        } else if (service === 'turn_on' || service === 'turn_off') {
            const p = this.findProp(spec, siid, 'on');
            if (p) await this.setPropConverted(p, did, siid, service === 'turn_on');
        }
    }

    /** climate set_hvac_mode 按设备类型区分（复刻 ha_xiaomi_home climate.py） */
    private async setClimateMode(
        spec: MIoTSpecInstance,
        did: string,
        siid: number,
        svcName: string,
        hvacMode: string
    ): Promise<void> {
        if (svcName === 'air-conditioner') {
            const onP = this.findProp(spec, siid, 'on');
            if (hvacMode === 'off') {
                if (onP) await this.setPropConverted(onP, did, siid, false);
            } else {
                if (onP) await this.setPropConverted(onP, did, siid, true);
                const modeP = this.findProp(spec, siid, 'mode');
                if (modeP) await this.setPropConverted(modeP, did, siid, this.hvacModeToValue(modeP, hvacMode));
            }
        } else if (svcName === 'ptc-bath-heater') {
            const modeP = this.findProp(spec, siid, 'mode');
            if (modeP) {
                if (hvacMode === 'off') {
                    const idleItem = modeP.valueList?.find((v) => v.name === 'idle');
                    if (idleItem) await this.setPropConverted(modeP, did, siid, idleItem.value);
                } else {
                    await this.setPropConverted(modeP, did, siid, this.hvacModeToValue(modeP, hvacMode));
                }
            }
        } else {
            // Heater/Thermostat/ElectricBlanket: 只设 on
            const onP = this.findProp(spec, siid, 'on');
            if (onP) await this.setPropConverted(onP, did, siid, hvacMode !== 'off');
        }
    }

    private async callHumidifier(did: string, siid: number, service: string, data: any): Promise<void> {
        const spec = await this.getSpec(did);
        if (service === 'turn_on' || service === 'turn_off') {
            const p = this.findProp(spec, siid, 'on', 'switch');
            if (p) await this.setPropConverted(p, did, siid, service === 'turn_on');
        } else if (service === 'set_humidity') {
            const p = this.findProp(spec, siid, 'target-humidity');
            if (p) await this.setPropConverted(p, did, siid, data.humidity);
        } else if (service === 'set_mode') {
            const p = this.findProp(spec, siid, 'mode');
            if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.mode));
        }
    }

    private async callMediaPlayer(did: string, siid: number, service: string, data: any): Promise<void> {
        const spec = await this.getSpec(did);
        if (service === 'play_media') {
            const a = this.findActionByName(spec, siid, 'play', 'play-media');
            if (a && a.in.length > 0 && data.media_content_id != null) {
                await this.#cloud.action(did, siid, a.iid, [{ piid: a.in[0], value: data.media_content_id }]);
            } else if (a) {
                await this.#cloud.action(did, siid, a.iid, []);
            }
        } else if (service === 'media_play') {
            await this.runAction(spec, did, siid, 'play');
        } else if (service === 'media_pause') {
            await this.runAction(spec, did, siid, 'pause');
        } else if (service === 'media_stop') {
            await this.runAction(spec, did, siid, 'stop');
        } else if (service === 'media_next_track') {
            await this.runAction(spec, did, siid, 'next', 'next-track');
        } else if (service === 'media_previous_track') {
            await this.runAction(spec, did, siid, 'previous', 'previous-track');
        } else if (service === 'volume_set') {
            // HA volume_level(0-1) -> 设备 valueRange 缩放（复刻 ha_xiaomi_home media_player.py）
            const p = this.findProp(spec, siid, 'volume', 'current-volume');
            if (p) {
                const val = p.valueRange ? this.scaleToRange(data.volume_level, 1, p.valueRange) : data.volume_level;
                await this.setPropConverted(p, did, siid, val);
            }
        } else if (service === 'volume_mute') {
            const p = this.findProp(spec, siid, 'mute', 'is-muted');
            if (p) await this.setPropConverted(p, did, siid, data.is_volume_muted);
        } else if (service === 'turn_on' || service === 'turn_off') {
            // 复刻 ha_xiaomi_home media_player.py: 优先 turn-on/turn-off action，fallback on 属性
            const a = this.findActionByName(spec, siid, service === 'turn_on' ? 'turn-on' : 'turn-off');
            if (a) await this.#cloud.action(did, siid, a.iid, []);
            else {
                const p = this.findProp(spec, siid, 'on');
                if (p) await this.setPropConverted(p, did, siid, service === 'turn_on');
            }
        } else if (service === 'select_source') {
            const p = this.findProp(spec, siid, 'input-control', 'source');
            if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.source));
        } else if (service === 'select_sound_mode') {
            const p = this.findProp(spec, siid, 'play-loop-mode');
            if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.sound_mode));
        }
    }

    private async callVacuum(did: string, siid: number, service: string, data: any): Promise<void> {
        const spec = await this.getSpec(did);
        if (service === 'start') {
            // 暂停状态优先 continue-sweep（复刻 ha_xiaomi_home vacuum.async_start）
            const statusP = this.findProp(spec, siid, 'status');
            if (statusP) {
                const status = await this.#cloud.getProp(did, siid, statusP.iid);
                if (this.isVacuumPaused(statusP, status)) {
                    const a = this.findActionByName(spec, siid, 'continue-sweep');
                    if (a) {
                        await this.#cloud.action(did, siid, a.iid, []);
                        return;
                    }
                }
            }
            await this.runAction(spec, did, siid, 'start-sweep');
        } else if (service === 'stop') {
            await this.runAction(spec, did, siid, 'stop-sweeping');
        } else if (service === 'pause') {
            await this.runAction(spec, did, siid, 'pause-sweeping');
        } else if (service === 'return_to_base') {
            const a = this.findActionByName(spec, siid, 'stop-and-gocharge', 'start-charge');
            if (a) await this.#cloud.action(did, siid, a.iid, []);
        } else if (service === 'locate') {
            await this.runAction(spec, did, siid, 'identify');
        } else if (service === 'set_fan_speed') {
            const p = this.findProp(spec, siid, 'fan-level');
            if (p) await this.setPropConverted(p, did, siid, this.mapValueList(p, data.fan_speed));
        }
    }

    private async callWaterHeater(did: string, siid: number, service: string, data: any): Promise<void> {
        const spec = await this.getSpec(did);
        if (service === 'turn_on' || service === 'turn_off') {
            const p = this.findProp(spec, siid, 'on');
            if (p) await this.setPropConverted(p, did, siid, service === 'turn_on');
        } else if (service === 'set_temperature') {
            const p = this.findProp(spec, siid, 'target-temperature');
            if (p) await this.setPropConverted(p, did, siid, data.temperature);
        } else if (service === 'set_operation_mode') {
            if (data.operation_mode === 'off') {
                const p = this.findProp(spec, siid, 'on');
                if (p) await this.setPropConverted(p, did, siid, false);
            } else if (data.operation_mode === 'on') {
                const p = this.findProp(spec, siid, 'on');
                if (p) await this.setPropConverted(p, did, siid, true);
            } else {
                // 先静默开机，再设模式（复刻 ha_xiaomi_home water_heater.async_set_operation_mode）
                const modeP = this.findProp(spec, siid, 'mode');
                if (modeP) {
                    const onP = this.findProp(spec, siid, 'on');
                    if (onP) await this.setPropConverted(onP, did, siid, true);
                    await this.setPropConverted(modeP, did, siid, this.mapValueList(modeP, data.operation_mode));
                }
            }
        }
    }

    /** notify/button 动作执行（按 spec.in_ 格式化参数） */
    async execNotify(did: string, siid: number, aiid: number, message: string): Promise<void> {
        const spec = await this.getSpec(did);
        const svc = spec?.services.find((s) => s.iid === siid);
        const action = svc?.actions.find((a) => a.iid === aiid);
        if (!svc || !action || action.in.length === 0) {
            await this.#cloud.action(did, siid, aiid, []);
            return;
        }
        // 尝试解析 message 为多参数（JSON 数组/对象，复刻 ha_xiaomi_home notify.py 的 YAML 解析）
        let parsed: any;
        try {
            parsed = JSON.parse(message);
        } catch {
            parsed = message;
        }
        const inList = action.in.map((piid, idx) => {
            const prop = svc.properties.find((p) => p.iid === piid);
            let raw: any;
            if (Array.isArray(parsed)) {
                raw = parsed[idx] ?? '';
            } else if (typeof parsed === 'object' && parsed !== null) {
                raw = parsed[prop?.name ?? ''] ?? parsed[idx] ?? '';
            } else {
                raw = idx === 0 ? parsed : '';
            }
            let value: any = raw;
            if (prop?.format === 'bool') value = raw === 'true' || raw === true || raw === '1';
            else if (prop?.format !== 'string') value = Number(raw) || 0;
            else value = String(raw);
            return { piid, value };
        });
        await this.#cloud.action(did, siid, aiid, inList);
    }

    private async runAction(spec: MIoTSpecInstance, did: string, siid: number, ...names: string[]): Promise<void> {
        const svc = spec?.services.find((s) => s.iid === siid);
        const action = svc?.actions.find((a) => names.includes(a.name));
        if (action) await this.#cloud.action(did, siid, action.iid, []);
    }

    // ============ 反向：MIoT 推送 -> HAEvent ============

    /** 属性变化 -> HAEvent */
    propToEvent(change: MiPropChange): { entityId: string; event: HAEvent } {
        const { did, siid, piid, value } = change;
        // 简单 entity：查 spec 按 piid 取 property，做 valueList/单位转换
        const entityId = this.#reversePropMap.get(`${did}_${siid}_${piid}`);
        if (entityId) {
            const parsed = this.#entityMap.get(entityId);
            const spec = this.#specCache.get(did);
            const prop = this.findPropByPiid(spec, siid, piid);
            return { entityId, event: this.wrapProperty(parsed?.domain ?? '', prop, value) };
        }
        // 复合 entity：用 spec 判断 piid 语义，匹配 service entity
        // siid 为 null 的设备级实体也参与匹配（通过 wrapComposite 的 property name 判定是否属于该 domain）
        for (const [eid, parsed] of this.#entityMap) {
            if (parsed.did === did && parsed.type === 'service' && (parsed.siid === siid || parsed.siid == null)) {
                const event = this.wrapComposite(parsed.domain, did, siid, piid, value);
                if (event) return { entityId: eid, event };
            }
        }
        return null;
    }

    /** 事件变化 -> HAEvent（复刻 ha_xiaomi_home event.py + miot_device.py: event_type=spec event name, attributes={prop description: value}） */
    eventToEvent(change: MiEventChange): { entityId: string; event: HAEvent } {
        const entityId = this.#reverseEventMap.get(`${change.did}_${change.siid}_${change.eiid}`);
        if (!entityId) return null;
        // event_type = spec event description（复刻 ha_xiaomi_home event.py: description_trans）
        const spec = this.#specCache.get(change.did);
        const svc = spec?.services.find((s) => s.iid === change.siid);
        const evt = svc?.events.find((e) => e.iid === change.eiid);
        const eventType = evt?.description ?? evt?.name ?? '';
        // attributes: 每个参数的 description -> value（复刻 ha_xiaomi_home miot_device.py:1164-1181）
        const attrs: Record<string, any> = {};
        if (change.arguments && svc) {
            for (const arg of change.arguments) {
                const prop = svc.properties.find((p) => p.iid === arg.piid);
                const key = prop?.description ?? prop?.name ?? `piid_${arg.piid}`;
                attrs[key] = arg.value;
            }
        }
        const event: HAEvent = {
            s: eventType as any,
            a: attrs as any,
            c: '',
            lc: nowTs()
        };
        return { entityId, event };
    }

    /** 拉取 direct 设备的初始状态（分批走云端 getProps，避免逐条 HTTP） */
    async fetchInitialState(eventHandler: (entityId: string, event: HAEvent) => void): Promise<void> {
        const dids = new Set<string>();
        for (const [, parsed] of this.#entityMap) {
            if (parsed.did) dids.add(parsed.did);
        }
        // 收集所有可读属性
        const params: { did: string; siid: number; piid: number }[] = [];
        for (const did of dids) {
            const spec = this.#specCache.get(did);
            if (!spec) continue;
            for (const svc of spec.services) {
                for (const prop of svc.properties) {
                    if (!prop.access.includes('read')) continue;
                    params.push({ did, siid: svc.iid, piid: prop.iid });
                }
            }
        }
        // 分批拉取（每批 50），失败一批不影响其他
        const BATCH = 50;
        for (let i = 0; i < params.length; i += BATCH) {
            const batch = params.slice(i, i + BATCH);
            try {
                const results = await this.#cloud.getProps(batch);
                for (const r of results) {
                    if (r.value == null) continue;
                    const res = this.propToEvent({ did: r.did, siid: r.siid, piid: r.piid, value: r.value });
                    if (res && DeviceManager.instance.isMiGatewayEntity(res.entityId)) {
                        eventHandler(res.entityId, res.event);
                    }
                }
            } catch (error) {
                logger.printError('[MiTranslator] fetchInitialState 批量拉取失败');
                logger.printError(error);
            }
        }
    }

    /** 简单属性包装（domain 专用逻辑优先，valueList 枚举转 description，bool 转 on/off，其余直传） */
    private wrapProperty(domain: string, prop: MIoTSpecProperty | undefined, value: any): HAEvent {
        // prop 未知（spec 未缓存）时直接用原始值做基础转换，避免 toHaValue 崩掉
        if (!prop) {
            if (domain === 'binary_sensor' || domain === 'switch' || domain === 'fan') {
                return { s: value ? 'on' : 'off', a: {} as any, c: '', lc: nowTs() };
            }
            return { s: value as any, a: {} as any, c: '', lc: nowTs() };
        }
        const v = this.toHaValue(prop, value);
        // domain 专用逻辑优先（避免 valueList 提前返回绕过 on/off、contact-state 反转等）
        // switch/fan/binary_sensor 统一按 bool 判定（复刻 ha_xiaomi_home value_format: value in [True,1,'True','true','1']）
        // 避免 uint8 枚举（如 1/2）都是 truthy 导致一直 on
        if (domain === 'switch' || domain === 'fan') {
            const on = [true, 1, 'True', 'true', '1'].includes(v);
            return { s: on ? 'on' : 'off', a: {} as any, c: '', lc: nowTs() };
        }
        if (domain === 'binary_sensor') {
            const on = [true, 1, 'True', 'true', '1'].includes(v);
            if (prop?.name === 'contact-state') {
                return { s: !on ? 'on' : 'off', a: {} as any, c: '', lc: nowTs() };
            }
            return { s: on ? 'on' : 'off', a: {} as any, c: '', lc: nowTs() };
        }
        // valueList 枚举转 description（sensor/select 等）
        if (prop?.valueList) {
            return { s: this.mapValueListReverse(prop, v) as any, a: {} as any, c: '', lc: nowTs() };
        }
        return { s: v as any, a: {} as any, c: '', lc: nowTs() };
    }

    /** 复合属性包装（light/cover/climate/humidifier，按 spec property name + 值转换 + 单位转换） */
    private wrapComposite(domain: string, did: string, siid: number, piid: number, value: any): HAEvent {
        const spec = this.#specCache.get(did);
        if (!spec) return null;
        const prop = this.findPropByPiid(spec, siid, piid);
        if (!prop) return null;
        const v = this.toHaValue(prop, value);
        const svcName = spec.services.find((s) => s.iid === siid)?.name ?? '';

        if (domain === 'light') {
            if (prop.name === 'on') return { s: v ? 'on' : 'off', a: {} as any, c: '', lc: nowTs() };
            if (prop.name === 'brightness' || prop.name === 'brightness-level') {
                const brightness = prop.valueRange ? this.scaleFromRange(Number(v), 255, prop.valueRange) : Number(v);
                return { s: 'on', a: { brightness } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'color-temperature') {
                return {
                    s: 'on',
                    a: { color_temp_kelvin: this.scaleColorTempReverse(prop, Number(v)) } as any,
                    c: '',
                    lc: nowTs()
                };
            }
            if (prop.name === 'color') {
                const c = Number(v);
                return { s: 'on', a: { rgb_color: [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff] } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'mode' || prop.name === 'effect') {
                return { s: '' as any, a: { effect: this.mapValueListReverse(prop, v) } as any, c: '', lc: nowTs() };
            }
            return null;
        }
        if (domain === 'cover') {
            if (prop.name === 'current-position' || prop.name === 'target-position') {
                const pos = prop.valueRange ? this.scaleCoverFromRange(Number(v), prop.valueRange) : Number(v);
                // 缓存当前位置（仅 current-position），供无 status 属性的 cover 在 callCover 判断命令方向
                if (prop.name === 'current-position') this.#coverPos.set(did, pos);
                const state = pos >= 100 ? 'open' : pos <= 0 ? 'closed' : 'open';
                return { s: state as any, a: { current_position: pos } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'tilt-angle' || prop.name === 'current-tilt') {
                const tilt = prop.valueRange ? this.scaleCoverFromRange(Number(v), prop.valueRange) : Number(v);
                return { s: '' as any, a: { current_tilt_position: tilt } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'status' || prop.name === 'motor-control') {
                // 用 name（英文，不受 multi_lang 影响）而非 description（中文）。
                // 精确集合匹配，复刻 ha_xiaomi_home cover.py:166 的 `item_name in {...}`——
                // 子串匹配会让 'stoplowerlimit' 之类被 'lower'(closing) 抢先命中。
                const name = this.mapValueListName(prop, v)
                    .toLowerCase()
                    .replace(/[^a-z]/g, '');
                if (COVER_STATUS_OPENING.has(name)) return { s: 'opening' as any, a: {} as any, c: '', lc: nowTs() };
                if (COVER_STATUS_CLOSING.has(name)) return { s: 'closing' as any, a: {} as any, c: '', lc: nowTs() };
                if (COVER_STATUS_CLOSED.has(name)) return { s: 'closed' as any, a: {} as any, c: '', lc: nowTs() };
                return null;
            }
            return null;
        }
        if (domain === 'climate') {
            if (prop.name === 'on' && svcName !== 'fan-control') {
                if (v === false) return { s: 'off' as any, a: {} as any, c: '', lc: nowTs() };
                // 开机态：有 mode 属性的设备（空调/浴霸）由 mode 广播决定具体模式，这里不抢；
                // 无 mode 的设备按官方 per-service 默认值（heater/electric-blanket -> heat, thermostat -> auto）。
                const hasMode = !!this.findProp(spec, siid, 'mode');
                if (hasMode) return null;
                const fallback = CLIMATE_ON_HVAC_MODE[svcName];
                if (!fallback) return null;
                return { s: fallback as any, a: {} as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'mode') {
                // 按 name（英文）归一到 HA hvac_mode，与正向 setClimateMode 收 HA 风格值对称。
                // 用 description（中文）会导致 J.N 里 s === 'cool' 永远不成立。
                const modeName = this.mapValueListName(prop, v)
                    .toLowerCase()
                    .replace(/[^a-z_]/g, '');
                const hvac = HVAC_MODE_MAP[modeName];
                if (!hvac) return null; // 未识别的 mode 不污染 state
                return { s: hvac as any, a: {} as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'temperature') {
                return { s: '' as any, a: { current_temperature: v } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'target-temperature') {
                return { s: '' as any, a: { target_temperature: v } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'relative-humidity') {
                return { s: '' as any, a: { current_humidity: v } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'target-humidity') {
                return { s: '' as any, a: { target_humidity: v } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'fan-level' || prop.name === 'fan-mode') {
                return { s: '' as any, a: { fan_mode: this.mapValueListReverse(prop, v) } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'on' && svcName === 'fan-control') {
                // 只有 fan-control.on 没有 fan-level 的设备，HA fan_mode 是 on/off
                // （复刻 ha_xiaomi_home climate.py:274 FAN_ON/FAN_OFF 分支）
                return { s: '' as any, a: { fan_mode: v ? 'on' : 'off' } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'swing' || prop.name === 'vertical-swing' || prop.name === 'horizontal-swing') {
                // 官方 swing_mode 由 horizontal + vertical 联合判定（both/horizontal/vertical/off）。
                // 我们逐属性推送，缓存另一侧最后值才能还原，否则单向摆风会被误报成 both。
                const isH = prop.name === 'horizontal-swing';
                const key = `${did}_${siid}`;
                const cached = this.#swingState.get(key) ?? {};
                if (prop.name === 'swing') {
                    // 单一 swing 属性的设备：无方向信息，按 both/off 处理
                    return { s: '' as any, a: { swing_mode: v ? 'both' : 'off' } as any, c: '', lc: nowTs() };
                }
                if (isH) cached.horizontal = !!v;
                else cached.vertical = !!v;
                this.#swingState.set(key, cached);
                const h = cached.horizontal ?? false;
                const vert = cached.vertical ?? false;
                const swingMode = h && vert ? 'both' : h ? 'horizontal' : vert ? 'vertical' : 'off';
                return { s: '' as any, a: { swing_mode: swingMode } as any, c: '', lc: nowTs() };
            }
            return null;
        }
        if (domain === 'fan') {
            if (prop.name === 'on' || prop.name === 'switch') {
                return { s: v ? 'on' : 'off', a: {} as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'fan-level' || prop.name === 'percentage' || prop.name === 'speed-level') {
                let percentage: number;
                if (prop.valueRange) {
                    percentage = this.scaleFromRange(Number(v), 100, prop.valueRange);
                } else if (prop.valueList && prop.valueList.length > 0) {
                    const idx = prop.valueList.findIndex((item) => item.value === v);
                    percentage = idx >= 0 ? orderedListIndexToPercentage(idx, prop.valueList.length) : 0;
                } else {
                    percentage = Number(v);
                }
                return { s: '' as any, a: { percentage } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'mode' || prop.name === 'fan-mode') {
                return { s: '' as any, a: { preset_mode: this.mapValueListReverse(prop, v) } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'horizontal-swing') {
                return { s: '' as any, a: { oscillating: !!v } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'wind-reverse') {
                // HA current_direction 只有 forward/reverse（复刻 ha_xiaomi_home fan.py:298）。
                // bool 格式：true=reverse；valueList 格式：按 name 匹配（官方兼容 foreward 拼写错误）。
                let isReverse: boolean;
                if (prop.format === 'bool') {
                    isReverse = !!v;
                } else {
                    const name = this.mapValueListName(prop, v)
                        .toLowerCase()
                        .replace(/[^a-z]/g, '');
                    isReverse = name === 'reversal' || name === 'reverse';
                }
                return { s: '' as any, a: { current_direction: isReverse ? 'reverse' : 'forward' } as any, c: '', lc: nowTs() };
            }
            return null;
        }
        if (domain === 'humidifier') {
            if (prop.name === 'on' || prop.name === 'switch') {
                return { s: v ? 'on' : 'off', a: {} as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'mode') {
                return { s: '' as any, a: { mode: this.mapValueListReverse(prop, v) } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'target-humidity') {
                return { s: '' as any, a: { target_humidity: v } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'relative-humidity') {
                return { s: '' as any, a: { current_humidity: v } as any, c: '', lc: nowTs() };
            }
            return null;
        }
        if (domain === 'vacuum') {
            if (prop.name === 'status') {
                return { s: this.vacuumState(prop, v) as any, a: {} as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'fan-level') {
                return { s: '' as any, a: { fan_speed: this.mapValueListReverse(prop, v) } as any, c: '', lc: nowTs() };
            }
            return null;
        }
        if (domain === 'water_heater') {
            if (prop.name === 'on') {
                return { s: v === false ? 'off' : v === true ? 'on' : ('' as any), a: {} as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'mode') {
                return { s: this.mapValueListReverse(prop, v) as any, a: {} as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'temperature') {
                return { s: '' as any, a: { current_temperature: v } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'target-temperature') {
                return { s: '' as any, a: { target_temperature: v } as any, c: '', lc: nowTs() };
            }
            return null;
        }
        if (domain === 'device_tracker') {
            if (prop.name === 'battery-level') return { s: '' as any, a: { battery_level: v } as any, c: '', lc: nowTs() };
            if (prop.name === 'latitude') return { s: '' as any, a: { latitude: v } as any, c: '', lc: nowTs() };
            if (prop.name === 'longitude') return { s: '' as any, a: { longitude: v } as any, c: '', lc: nowTs() };
            if (prop.name === 'area-id') return { s: '' as any, a: { location_name: v } as any, c: '', lc: nowTs() };
            return null;
        }
        if (domain === 'media_player') {
            if (prop.name === 'on') return { s: v ? 'on' : 'off', a: {} as any, c: '', lc: nowTs() };
            if (prop.name === 'volume' || prop.name === 'current-volume') {
                const vol = prop.valueRange ? this.scaleFromRange(Number(v), 1, prop.valueRange) : Number(v);
                return { s: '' as any, a: { volume_level: vol } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'mute' || prop.name === 'is-muted') {
                return { s: '' as any, a: { is_volume_muted: !!v } as any, c: '', lc: nowTs() };
            }
            if (prop.name === 'playing-state') {
                const name = this.mapValueListName(prop, v)
                    .toLowerCase()
                    .replace(/[^a-z]/g, '');
                const state =
                    name === 'playing'
                        ? 'playing'
                        : name === 'pause' || name === 'paused'
                          ? 'paused'
                          : name === 'off'
                            ? 'off'
                            : 'idle';
                return { s: state as any, a: {} as any, c: '', lc: nowTs() };
            }
            return null;
        }
        return null;
    }

    // ============ 辅助 ============

    /**
     * 设备级实体（entity_id 无 _s_ 后缀）按 domain 从 spec 反查 service siid。
     * 复刻 ha_xiaomi_home spec_transform 的 domain 判定逻辑：按 service 内 property name 匹配。
     */
    private findServiceSiidByDomain(spec: MIoTSpecInstance, domain: string): number {
        if (!spec) return undefined;
        for (const svc of spec.services) {
            const names = new Set(svc.properties.map((p) => p.name));
            switch (domain) {
                case 'light':
                    if (
                        names.has('on') &&
                        (names.has('brightness') ||
                            names.has('color') ||
                            names.has('color-temperature') ||
                            names.has('brightness-level'))
                    )
                        return svc.iid;
                    break;
                case 'cover':
                    if (names.has('motor-control') || names.has('target-position') || names.has('current-position'))
                        return svc.iid;
                    break;
                case 'climate':
                    if (names.has('target-temperature') || (names.has('on') && names.has('mode'))) return svc.iid;
                    break;
                case 'fan':
                    if (names.has('on') && (names.has('fan-level') || names.has('fan-mode') || names.has('speed-level')))
                        return svc.iid;
                    break;
                case 'humidifier':
                    if (names.has('on') && (names.has('target-humidity') || names.has('mode'))) return svc.iid;
                    break;
                case 'water_heater':
                    if (names.has('on') && names.has('target-temperature')) return svc.iid;
                    break;
                case 'media_player':
                    if (names.has('volume') || names.has('playing-state') || names.has('current-volume')) return svc.iid;
                    break;
                case 'vacuum':
                    if (names.has('status') || names.has('fan-level')) return svc.iid;
                    break;
                case 'switch':
                    if (names.has('on') && svc.properties.length <= 2) return svc.iid;
                    break;
            }
        }
        return undefined;
    }

    private async getSpec(did: string): Promise<MIoTSpecInstance> {
        if (this.#specCache.has(did)) return this.#specCache.get(did)!;
        const spec = await this.#spec.getSpecByDid(did);
        // 只缓存成功结果，避免网络抖动导致的 null 被永久缓存
        if (spec) this.#specCache.set(did, spec);
        return spec;
    }

    /**
     * 丢弃本层按 did 缓存的 spec 及其派生状态。
     * 必须与 MiSpecStore.invalidateCache 一起调用——否则 store 重拉了新 spec，
     * 本层仍拿着旧结构（本层按 did 缓存，store 按 urn，两者独立）。
     */
    invalidateSpecCache(): void {
        this.#specCache.clear();
        this.#coverPos.clear();
        this.#swingState.clear();
    }

    private findProp(spec: MIoTSpecInstance, siid: number, ...names: string[]): MIoTSpecProperty {
        if (!spec) return undefined;
        const svc = spec.services.find((s) => s.iid === siid);
        if (!svc) return undefined;
        for (const name of names) {
            const p = svc.properties.find((pp) => pp.name === name);
            if (p) return p;
        }
        return undefined;
    }

    /** 按 piid 查找属性 */
    private findPropByPiid(spec: MIoTSpecInstance, siid: number, piid: number): MIoTSpecProperty {
        const svc = spec?.services.find((s) => s.iid === siid);
        return svc?.properties.find((p) => p.iid === piid);
    }

    /** valueList 反向映射：value -> description（复刻 ha_xiaomi_home to_map() 返回 description） */
    private mapValueListReverse(prop: MIoTSpecProperty, value: any): any {
        if (!prop?.valueList) return value;
        const item = prop.valueList.find((v) => v.value === value);
        return item?.description ?? value;
    }

    /**
     * HA hvac_mode -> 设备 mode 枚举值。与反向的 HVAC_MODE_MAP 对称：
     * 按 name 经同一张表归一后比对，解决 HA 的 fan_only 与 spec 的 fan 名称不一致。
     * 找不到对应档位时退回通用 mapValueList（兼容 spec name 直接等于 HA 值的设备）。
     */
    private hvacModeToValue(prop: MIoTSpecProperty, hvacMode: string): any {
        const item = prop.valueList?.find((v) => {
            const name = (v.name ?? '').toLowerCase().replace(/[^a-z_]/g, '');
            return HVAC_MODE_MAP[name] === hvacMode;
        });
        return item ? item.value : this.mapValueList(prop, hvacMode);
    }

    /** valueList 反向映射：value -> name（英文 slug，不受 multi_lang 翻译影响，用于关键词匹配） */
    private mapValueListName(prop: MIoTSpecProperty, value: any): string {
        if (!prop?.valueList) return String(value);
        const item = prop.valueList.find((v) => v.value === value);
        return item?.name ?? item?.description ?? String(value);
    }

    /** HA 值(0-haMax) -> 设备值(range min-max)，含 min 偏移（复刻 ha_xiaomi_home brightness_to_value / percentage_to_ranged_value） */
    private scaleToRange(value: number, haMax: number, range: [number, number, number]): number {
        const [min, max] = range;
        return min + (value / haMax) * (max - min);
    }

    /** 设备值(range min-max) -> HA 值(0-haMax)，含 min 偏移 */
    private scaleFromRange(deviceValue: number, haMax: number, range: [number, number, number]): number {
        const [min, max] = range;
        return Math.round(((deviceValue - min) / (max - min)) * haMax);
    }

    /** cover 专用：HA position(0-100) -> 设备值，不含 min 偏移（复刻 ha_xiaomi_home cover.py: pos*(max-min)/100） */
    private scaleCoverToRange(position: number, range: [number, number, number]): number {
        const [min, max] = range;
        return (position / 100) * (max - min);
    }

    /** cover 专用：设备值 -> HA position(0-100)，不含 min 偏移（复刻 ha_xiaomi_home cover.py: v*100/(max-min)） */
    private scaleCoverFromRange(deviceValue: number, range: [number, number, number]): number {
        const [min, max] = range;
        return Math.round((deviceValue / (max - min)) * 100);
    }

    /** 正向：HA color_temp_kelvin(K) -> MIoT 色温（按 unit 判断 K 或 mired） */
    private scaleColorTemp(prop: MIoTSpecProperty, kelvin: number): number {
        if (prop?.unit === 'mired') return Math.round(1000000 / kelvin);
        return kelvin;
    }

    /** 反向：MIoT 色温 -> HA color_temp_kelvin(K) */
    private scaleColorTempReverse(prop: MIoTSpecProperty, value: number): number {
        if (prop?.unit === 'mired') return Math.round(1000000 / value);
        return value;
    }

    /** 按 name 查找动作 */
    private findActionByName(spec: MIoTSpecInstance, siid: number, ...names: string[]): MIoTSpecAction {
        const svc = spec?.services.find((s) => s.iid === siid);
        if (!svc) return undefined;
        for (const name of names) {
            const a = svc.actions.find((aa) => aa.name === name);
            if (a) return a;
        }
        return undefined;
    }

    /** 值格式转换（1:1 复刻 ha_xiaomi_home MIoTSpecProperty.value_format） */
    private valueFormat(prop: MIoTSpecProperty, value: any): any {
        if (value == null) return null;
        const f = prop.format;
        if (typeof value === 'string') {
            if (f === 'float') return parseFloat(value);
            // int 系列（uint8/int32 等）-> 截断
            if (f !== 'string' && f !== 'bool') return Math.trunc(parseFloat(value));
        }
        if (f === 'bool') return [true, 1, 'True', 'true', '1'].includes(value);
        return value;
    }

    /** 值精度对齐（1:1 复刻 ha_xiaomi_home MIoTSpecProperty.value_precision） */
    private valuePrecision(prop: MIoTSpecProperty, value: any): any {
        if (value == null) return null;
        const f = prop.format;
        const precision = prop.precision ?? 1;
        if (f === 'float') return Number(value.toFixed(precision));
        if (f !== 'string' && f !== 'bool') {
            if (!prop.valueRange) return Math.round(value);
            const step = prop.valueRange[2];
            return Math.round(value / step) * step;
        }
        return value;
    }

    /** 表达式求值（1:1 复刻 ha_xiaomi_home MIoTSpecProperty.eval_expr） */
    private evalExpr(prop: MIoTSpecProperty, value: any): any {
        if (!prop.expr) return value;
        try {
            return new Function('src_value', `return ${prop.expr}`)(value);
        } catch {
            return value;
        }
    }

    /** 正向：HA value -> MIoT value（format + precision） */
    private toMiotValue(prop: MIoTSpecProperty, value: any): any {
        return this.valuePrecision(prop, this.valueFormat(prop, value));
    }

    /** 反向：MIoT value -> HA value（format -> expr -> precision，复刻 __on_properties_changed 顺序） */
    private toHaValue(prop: MIoTSpecProperty, value: any): any {
        let v = this.valueFormat(prop, value);
        v = this.evalExpr(prop, v);
        v = this.valuePrecision(prop, v);
        return v;
    }

    /** setProp + 值转换 */
    private async setPropConverted(prop: MIoTSpecProperty, did: string, siid: number, value: any): Promise<void> {
        await this.#cloud.setProp(did, siid, prop.iid, this.toMiotValue(prop, value));
    }

    /** vacuum status 归一化（去非 a-z，用 name 英文匹配，不受 multi_lang 影响） */
    private vacuumStatusName(prop: MIoTSpecProperty, value: any): string {
        const item = prop.valueList?.find((v) => v.value === value);
        if (!item) return '';
        return (item.name ?? item.description ?? '').toLowerCase().replace(/[^a-z]/g, '');
    }

    /** 判断 vacuum 是否暂停 */
    private isVacuumPaused(prop: MIoTSpecProperty, value: any): boolean {
        const name = this.vacuumStatusName(prop, value);
        return name === 'paused' || name === 'pause';
    }

    /** vacuum status -> VacuumActivity（复刻 ha_xiaomi_home 分类规则） */
    private vacuumState(prop: MIoTSpecProperty, value: any): string {
        const name = this.vacuumStatusName(prop, value);
        if (!name) return 'idle';
        if (
            name.includes('sweeping') ||
            name.includes('mopping') ||
            ['cleaning', 'remoteclean', 'continuesweep', 'busy', 'building', 'buildingmap', 'mapping'].includes(name)
        ) {
            return 'cleaning';
        }
        if (
            [
                'charging',
                'charged',
                'chargingcompleted',
                'fullcharge',
                'fullpower',
                'findchargerpause',
                'drying',
                'washing',
                'wash',
                'inthewash',
                'inthedry',
                'stationworking',
                'dustcollecting',
                'upgrade',
                'upgrading',
                'updating'
            ].includes(name)
        ) {
            return 'docked';
        }
        if (['paused', 'pause'].includes(name)) return 'paused';
        if (
            [
                'gocharging',
                'cleancompletegocharging',
                'findchargewash',
                'backtowashmop',
                'gowash',
                'gowashing',
                'summon'
            ].includes(name)
        )
            return 'returning';
        if (['error', 'breakcharging', 'gochargebreak'].includes(name)) return 'error';
        return 'idle';
    }

    /** 按 valueList 描述映射枚举值 */
    private mapValueList(prop: MIoTSpecProperty, value: any): any {
        if (!prop?.valueList) return value;
        const item = prop.valueList.find((v) => v.name === value || v.description === value || v.value === value);
        return item?.value ?? value;
    }

    static get instance(): MiTranslator {
        if (!MiTranslator.#instance) MiTranslator.#instance = new MiTranslator();
        return MiTranslator.#instance;
    }
}

