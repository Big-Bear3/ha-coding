import axios from 'axios';
import { logger } from '../logger-service.js';
import { MiStorage } from './mi-storage.js';
import { MiDeviceList } from './mi-device-list.js';
import { MI_SPEC_API_URL, MI_SPEC_MULTI_LANG_API_URL } from './mi-constants.js';
import type { MIoTSpecInstance, MIoTSpecService, MIoTSpecProperty, MIoTFormat } from './mi-types.js';

/** 从 MIoT Spec URN 提取 name（urn:miot-spec-v2:property:on:... -> on） */
function nameFromUrn(urn: string): string {
    const parts = urn.split(':');
    return parts[3] ?? '';
}

/** slugify（复刻 ha_xiaomi_home 的 python-slugify，用于 valueList name） */
function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/** 从 value-range 的 step 推断 precision（小数位），复刻 ha_xiaomi_home 的 value_range.setter */
function precisionFromStep(step: number): number {
    if (step == null) return 1;
    const s = step.toString();
    const dot = s.indexOf('.');
    return dot >= 0 ? s.length - dot - 1 : 0;
}

/** MIoT Spec 缓存，从 miot-spec.org 拉取设备能力描述并本地缓存 */
export class MiSpecStore {
    static #instance: MiSpecStore;

    #storage = MiStorage.instance;

    #specCache = new Map<string, MIoTSpecInstance>();

    private constructor() {}

    /** 通过 did 查找 spec（经设备列表取 urn） */
    async getSpecByDid(did: string): Promise<MIoTSpecInstance> {
        const device = MiDeviceList.instance.getDevice(did);
        if (!device?.urn) return null;
        return this.getSpecByUrn(device.urn);
    }

    /**
     * 通过 urn 查找 spec，优先本地缓存。
     * @param forceRefresh 跳过内存与持久化缓存，强制重新拉取（排障用）
     */
    async getSpecByUrn(urn: string, forceRefresh = false): Promise<MIoTSpecInstance> {
        if (!forceRefresh) {
            if (this.#specCache.has(urn)) return this.#specCache.get(urn)!;

            // 持久化缓存已做版本/TTL 校验，返回 null 即视为未缓存
            const cached = this.#storage.getSpec(urn);
            if (cached) {
                try {
                    const spec = JSON.parse(cached);
                    this.#specCache.set(urn, spec);
                    return spec;
                } catch {}
            }
        }

        try {
            const res = await axios.get(MI_SPEC_API_URL, {
                params: { type: urn },
                timeout: 30 * 1000
            });
            const spec = this.parseSpec(res.data, urn);
            // 拉取多语言翻译并覆盖 description（复刻 ha_xiaomi_home description_trans，J.N 依赖中文 key）
            const trans = await this.fetchMultiLang(urn);
            if (trans.size) this.applyTranslations(spec, trans);
            // 翻译后去重（顺序与官方一致：name 取英文 description -> 翻译覆盖 description -> from_spec 去重）
            this.dedupValueListDescriptions(spec);
            this.#specCache.set(urn, spec);
            this.#storage.setSpec(urn, JSON.stringify(spec));
            logger.print(`[MiSpec] 已拉取 spec: ${urn} (翻译 ${trans.size} 项)`);
            return spec;
        } catch (error) {
            logger.printError(`[MiSpec] 拉取 spec 失败: ${urn}`);
            logger.printError(error);
            return null;
        }
    }

    /**
     * 拉取 spec 多语言翻译（复刻 ha_xiaomi_home __get_multi_lang_async）。
     * 返回 key->中文 的 Map，key 形如 s:2 / p:2:1 / e:2:1 / v:2:1:0
     */
    private async fetchMultiLang(urn: string): Promise<Map<string, string>> {
        const trans = new Map<string, string>();
        try {
            const res = await axios.get(MI_SPEC_MULTI_LANG_API_URL, {
                params: { urn },
                timeout: 30 * 1000
            });
            const langData = res.data?.data?.zh_cn ?? {};
            for (const [tag, value] of Object.entries<string>(langData)) {
                if (!value || !value.trim()) continue;
                const strs = tag.split(':');
                if (strs.length === 2) {
                    trans.set(`s:${parseInt(strs[1], 10)}`, value);
                } else if (strs.length === 4) {
                    const type = strs[2] === 'property' ? 'p' : strs[2] === 'action' ? 'a' : 'e';
                    trans.set(`${type}:${parseInt(strs[1], 10)}:${parseInt(strs[3], 10)}`, value);
                } else if (strs.length === 6) {
                    trans.set(`v:${parseInt(strs[1], 10)}:${parseInt(strs[3], 10)}:${parseInt(strs[5], 10)}`, value);
                }
            }
        } catch (error) {
            logger.printWarn(`[MiSpec] 拉取 multi_lang 失败: ${urn}`);
        }
        return trans;
    }

    /** 将多语言翻译应用到 spec 的 description 字段（property/event/valueList） */
    private applyTranslations(spec: MIoTSpecInstance, trans: Map<string, string>): void {
        for (const svc of spec.services) {
            for (const prop of svc.properties) {
                const pTrans = trans.get(`p:${svc.iid}:${prop.iid}`);
                if (pTrans) prop.description = pTrans;
                if (prop.valueList) {
                    for (let i = 0; i < prop.valueList.length; i++) {
                        const vTrans = trans.get(`v:${svc.iid}:${prop.iid}:${i}`);
                        if (vTrans) prop.valueList[i].description = vTrans;
                    }
                }
            }
            for (const evt of svc.events) {
                const eTrans = trans.get(`e:${svc.iid}:${evt.iid}`);
                if (eTrans) evt.description = eTrans;
            }
        }
    }

    /**
     * valueList 内重复 description 追加 _2/_3（复刻 ha_xiaomi_home MIoTSpecValueList.from_spec）。
     * mapValueList/mapValueListReverse 按 description 反查，不去重会命中第一个导致选错档。
     * 翻译后中文撞名概率高于英文原文，故必须在 applyTranslations 之后执行。
     */
    private dedupValueListDescriptions(spec: MIoTSpecInstance): void {
        for (const svc of spec.services) {
            for (const prop of svc.properties) {
                if (!prop.valueList?.length) continue;
                const seen = new Map<string, number>();
                for (const item of prop.valueList) {
                    // 空 description 兜底为 v_{value}（复刻官方）
                    const base = item.description?.trim() ? item.description : `v_${item.value}`;
                    const count = (seen.get(base) ?? 0) + 1;
                    seen.set(base, count);
                    if (count > 1) {
                        item.description = `${base}_${count}`;
                        if (item.name) item.name = `${item.name}_${count}`;
                    } else {
                        item.description = base;
                    }
                }
            }
        }
    }

    /** 解析 miot-spec.org 原始 JSON 为结构化 spec */
    private parseSpec(data: any, urn: string): MIoTSpecInstance {
        const services: MIoTSpecService[] = (data.services ?? []).map(
            (svc: any): MIoTSpecService => ({
                iid: svc.iid,
                name: nameFromUrn(svc.type),
                properties: (svc.properties ?? []).map(
                    (p: any): MIoTSpecProperty => ({
                        iid: p.iid,
                        name: nameFromUrn(p.type),
                        description: p.description,
                        format: p.format as MIoTFormat,
                        access: p.access ?? [],
                        unit: p.unit,
                        valueRange: p['value-range'],
                        valueList: p['value-list']?.map((v: any) => ({
                            value: v.value,
                            description: v.description,
                            name: v.name ? slugify(v.name) : slugify(v.description ?? '')
                        })),
                        precision: p.precision ?? precisionFromStep(p['value-range']?.[2]),
                        expr: p.expr
                    })
                ),
                events: (svc.events ?? []).map((e: any) => ({
                    iid: e.iid,
                    name: nameFromUrn(e.type),
                    description: e.description,
                    arguments: e.arguments ?? []
                })),
                actions: (svc.actions ?? []).map((a: any) => ({
                    iid: a.iid,
                    name: nameFromUrn(a.type),
                    in: a.in ?? [],
                    out: a.out ?? []
                }))
            })
        );
        return { urn, name: data.description ?? '', description: data.description, services };
    }

    /**
     * 丢弃所有 spec 缓存（内存 + 持久化），返回清除的持久化条数。
     * 正常无需调用——版本号变更会自动失效；供排障或上游 spec 变更时手动刷新。
     */
    invalidateCache(): number {
        this.#specCache.clear();
        const removed = this.#storage.clearSpecCache();
        logger.print(`[MiSpec] 已清除 spec 缓存：内存 + 持久化 ${removed} 条`);
        return removed;
    }

    /** 在 spec 的指定 service 内按 name 查找属性 */
    findProperty(spec: MIoTSpecInstance, siid: number, name: string): MIoTSpecProperty {
        const svc = spec.services.find((s) => s.iid === siid);
        return svc?.properties.find((p) => p.name === name);
    }

    /** 查找 service */
    findService(spec: MIoTSpecInstance, siid: number): MIoTSpecService {
        return spec.services.find((s) => s.iid === siid);
    }

    static get instance(): MiSpecStore {
        if (!MiSpecStore.#instance) MiSpecStore.#instance = new MiSpecStore();
        return MiSpecStore.#instance;
    }
}

