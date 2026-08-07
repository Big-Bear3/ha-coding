#!/usr/bin/env node
/**
 * 小米设备发现工具：读取本地 miLogin 凭证，拉取账号设备列表 + miot-spec，
 * 按 ha_xiaomi_home 规则生成 entity_id 清单 + @Device 配置模板。
 *
 * 用法：在已执行过 miLogin 的项目根目录（含 .localstorage/mi_auth_info）下运行
 *   node ha-coding/scripts/discover-devices.mjs [过滤词]
 * 过滤词：仅显示 name/model/did 包含该词的设备。输出同时写入 ./mi-devices-discovered.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN_PATH = join(process.cwd(), '.localstorage', 'mi_auth_info');
const API_HOST = 'ha.api.io.mi.com';
const SPEC_URL = 'https://miot-spec.org/miot-spec-v2/instance';
const MULTI_LANG_URL = 'https://miot-spec.org/instance/v2/multiLanguage';
const CLIENT_ID = '2882303761520251711';
const CLOUD_SERVER = 'cn';

const filter = process.argv[2]?.toLowerCase();

function readToken() {
    try {
        return JSON.parse(readFileSync(TOKEN_PATH, 'utf8')).access_token;
    } catch {
        console.error(`未找到 ${TOKEN_PATH}。请先在当前目录执行 miLogin（小米 OAuth 登录）。`);
        process.exit(1);
    }
}

const token = readToken();
const headers = {
    'X-Client-BizId': 'haapi',
    'Content-Type': 'application/json',
    Authorization: `Bearer${token}`,
    'X-Client-AppId': CLIENT_ID
};

async function fetchDeviceList() {
    const all = [];
    let startDid = null;
    do {
        const body = { limit: 200, get_split_device: true, get_third_device: true, dids: [] };
        if (startDid) body.start_did = startDid;
        const r = await fetch(`https://${API_HOST}/app/v2/home/device_list_page`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        const j = await r.json();
        for (const d of j?.result?.list ?? []) {
            if (!d.did || !d.model || !d.spec_type) continue;
            if (d.did.startsWith('miwifi.')) continue;
            all.push({
                did: d.did,
                model: d.model,
                name: d.name,
                urn: d.spec_type,
                online: !!d.isOnline,
                localip: d.localip ?? null
            });
        }
        startDid = j?.result?.has_more ? j?.result?.next_start_did : null;
    } while (startDid);
    return all;
}

/** slugify（复刻 ha_xiaomi_home python-slugify，非字母数字转下划线） */
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/** urn:miot-spec-v2:property:on:... -> on */
function nameFromUrn(urn) {
    return urn.split(':')[3] ?? '';
}

/** 设备类型：urn:miot-spec-v2:device:switch:... -> switch */
function deviceTypeFromUrn(urn) {
    return urn.split(':')[3] ?? '';
}

async function fetchSpec(urn) {
    const r = await fetch(`${SPEC_URL}?type=${encodeURIComponent(urn)}`, { timeout: 30000 });
    const data = await r.json();
    const services = (data.services ?? []).map((svc) => ({
        iid: svc.iid,
        name: nameFromUrn(svc.type),
        properties: (svc.properties ?? []).map((p) => ({
            iid: p.iid,
            name: nameFromUrn(p.type),
            description: p.description,
            format: p.format,
            access: p.access ?? [],
            unit: p.unit,
            valueList: p['value-list']?.map((v) => ({ value: v.value, description: v.description })),
            valueRange: p['value-range']
        })),
        events: (svc.events ?? []).map((e) => ({ iid: e.iid, name: nameFromUrn(e.type), description: e.description })),
        actions: (svc.actions ?? []).map((a) => ({ iid: a.iid, name: nameFromUrn(a.type), in: a.in ?? [], out: a.out ?? [] }))
    }));
    // 中文描述（可选，失败不阻断）
    // 真实 key 形如 service:002:property:001 / service:002:property:002:valuelist:000（三位零填充），
    // 按 ':' 分段取数字段，避免零填充位数变化时匹配不上。
    try {
        const ml = await (await fetch(`${MULTI_LANG_URL}?urn=${encodeURIComponent(urn)}`)).json();
        const zh = ml?.data?.zh_cn ?? {};
        const trans = new Map();
        for (const [tag, value] of Object.entries(zh)) {
            if (typeof value !== 'string' || !value.trim()) continue;
            const s = tag.split(':');
            if (s.length === 4) {
                const kind = s[2] === 'property' ? 'p' : s[2] === 'action' ? 'a' : 'e';
                trans.set(`${kind}:${parseInt(s[1], 10)}:${parseInt(s[3], 10)}`, value);
            } else if (s.length === 6) {
                trans.set(`v:${parseInt(s[1], 10)}:${parseInt(s[3], 10)}:${parseInt(s[5], 10)}`, value);
            }
        }
        for (const svc of services) {
            for (const p of svc.properties) {
                const t = trans.get(`p:${svc.iid}:${p.iid}`);
                if (t) p.description = t;
                if (p.valueList)
                    p.valueList.forEach((v, i) => {
                        const vt = trans.get(`v:${svc.iid}:${p.iid}:${i}`);
                        if (vt) v.description = vt;
                    });
            }
            for (const e of svc.events) {
                const t = trans.get(`e:${svc.iid}:${e.iid}`);
                if (t) e.description = t;
            }
        }
        if (!trans.size) console.warn(`  [warn] 未取到中文翻译，描述保持英文: ${urn}`);
    } catch {
        console.warn(`  [warn] multiLanguage 请求失败，描述保持英文: ${urn}`);
    }
    return services;
}

/** 按属性名/格式启发式建议 HA domain（仅供参考，用户/AI 可调整） */
function suggestDomain(prop, deviceType) {
    const writable = prop.access.includes('write');
    const n = prop.name;
    if (n === 'on') return writable ? 'switch' : 'binary_sensor';
    if (
        ['current-position', 'target-position', 'motor-status', 'status'].includes(n) &&
        /curtain|window-opener|awning|blind|shutter|airer/i.test(deviceType)
    )
        return 'cover';
    if (
        [
            'temperature',
            'relative-humidity',
            'pm2.5-density',
            'co2-density',
            'voc-density',
            'illumination',
            'electric-power',
            'voltage',
            'electric-current',
            'energy-consumption',
            'battery-level',
            'signal-strength'
        ].includes(n)
    )
        return 'sensor';
    if (['brightness', 'color-temperature', 'color', 'mode'].includes(n) && /light|lamp/i.test(deviceType)) return 'light';
    if (['contact', 'occupancy', 'motion', 'open', 'water-leak', 'smoke', 'gas', 'no-one'].includes(n)) return 'binary_sensor';
    if (prop.format === 'bool') return writable ? 'switch' : 'binary_sensor';
    return 'sensor';
}

/**
 * did_tag = slugify(`{cloud_server}_{did}`)（复刻 ha_xiaomi_home slugify_did）。
 * 必须整体 slugify：BLE did 形如 blt.3.xxx、群组 group.123，点号要转下划线，
 * 否则生成的 entity_id 非法且与 HA 中实际值不符。
 */
function didTag(did) {
    return slugify(`${CLOUD_SERVER}_${did}`);
}

function genEntityId(domain, model, did, specName, type, siid, id) {
    const ms = model.split('.');
    const m0 = (ms[0] ?? '').slice(0, 9);
    const mN = (ms[ms.length - 1] ?? '').slice(0, 20);
    return `${domain}.${m0}_${didTag(did)}_${mN}_${slugify(specName)}_${type}_${siid}_${id}`;
}

function pascalCase(s) {
    return (s ?? '')
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join('');
}

/** 框架导出的标识符，类名不能与之冲突 */
const RESERVED_NAMES = new Set(['Device', 'DeviceDef', 'State', 'Action', 'HAEvent', 'createDevice']);

/**
 * 生成类名。小米设备名多为纯中文，pascalCase 会得到空串，
 * 此时退回 model 的设备类型段（yszn01.airer.ys2103 -> MiAirer），
 * 避免生成 `class Device` 与导入的 @Device 装饰器同名导致编译失败。
 */
function className(dev) {
    let cls = pascalCase(dev.name);
    if (!cls || RESERVED_NAMES.has(cls)) {
        const seg = dev.model.split('.');
        cls = 'Mi' + pascalCase(seg[1] || seg[0] || '');
    }
    if (!cls || RESERVED_NAMES.has(cls) || /^\d/.test(cls)) cls = 'MiDevice';
    return cls;
}

function buildTemplate(dev, services) {
    const cls = className(dev);
    const entityIds = [];
    const entityIdValues = [];
    const stateFields = [];
    for (const svc of services) {
        for (const p of svc.properties) {
            if (!p.access.includes('notify') && !p.access.includes('read')) continue;
            const domain = suggestDomain(p, deviceTypeFromUrn(dev.urn));
            const eid = genEntityId(domain, dev.model, dev.did, p.name, 'p', svc.iid, p.iid);
            const key = p.name.replace(/-/g, '');
            // $entityIds 是类型声明（值由 createDevice 传入），这里只声明 string
            entityIds.push(`        /** ${p.description || p.name} (${p.format}) */`);
            entityIds.push(`        ${key}: string;`);
            entityIdValues.push(`    ${key}: '${eid}',`);
            if (p.access.includes('write')) {
                stateFields.push(`    /** ${p.description || p.name} */`);
                stateFields.push(`    @State() ${p.name.replace(/-/g, '')}: ${p.format === 'bool' ? 'boolean' : 'number'};`);
            }
        }
    }
    const instName = cls.charAt(0).toLowerCase() + cls.slice(1);
    return `// 1) 设备定义（建议放 src/devices-def/）
import { Device, DeviceDef, HAEvent, State } from 'ha-coding';

/** ${dev.name}（${dev.model}, did=${dev.did}）*/
@Device({ miGatewayDirect: true })
export class ${cls} implements DeviceDef {
    // $entityIds 只声明类型，实际 entity_id 在 createDevice 时传入
    $entityIds: {
${entityIds.join('\n')}
    };
${stateFields.length ? '\n' + stateFields.join('\n') : ''}

    $onEvent({ a, s }: HAEvent, entityId: string): void {
        // TODO: 按 entityId 分发到各 @State 字段
    }
}

// 2) 设备实例（建议放 src/devices/）
import { createDevice } from 'ha-coding';

export const ${instName} = createDevice(${cls}, {
${entityIdValues.join('\n')}
});
`;
}

async function main() {
    console.log('正在拉取设备列表...');
    const devices = await fetchDeviceList();
    const filtered = filter
        ? devices.filter((d) => [d.name, d.model, d.did].some((v) => v?.toLowerCase().includes(filter)))
        : devices;
    console.log(`共 ${devices.length} 个设备${filter ? `，过滤后 ${filtered.length} 个` : ''}。\n`);

    const out = [];
    out.push(
        `# 小米设备发现清单\n\n共 ${devices.length} 个设备${filter ? `（过滤: ${filter}, ${filtered.length} 个）` : ''}。\n`
    );
    out.push('| name | model | did | online | WiFi(localip) |');
    out.push('|---|---|---|---|---|');
    for (const d of filtered) {
        out.push(
            `| ${d.name} | ${d.model} | ${d.did} | ${d.online ? '✅' : '❌'} | ${d.localip ? '✅(云端推送)' : '❌(本地推送)'} |`
        );
    }
    out.push('');

    for (const d of filtered) {
        console.log(`拉取 spec: ${d.name} (${d.model})...`);
        let services;
        try {
            services = await fetchSpec(d.urn);
        } catch (e) {
            out.push(`## ${d.name} - spec 拉取失败\n`);
            continue;
        }
        const dt = deviceTypeFromUrn(d.urn);
        out.push(`## ${d.name}（${d.model}）`);
        out.push(`- did: \`${d.did}\`  model: \`${d.model}\`  online: ${d.online}  推送: ${d.localip ? '云端' : '本地'}`);
        out.push(`\n### 属性（entity_id）\n`);
        out.push('| siid | piid | spec_name | domain | format | access | description | entity_id |');
        out.push('|---|---|---|---|---|---|---|---|');
        for (const svc of services) {
            for (const p of svc.properties) {
                const domain = suggestDomain(p, dt);
                const eid = genEntityId(domain, d.model, d.did, p.name, 'p', svc.iid, p.iid);
                out.push(
                    `| ${svc.iid} | ${p.iid} | ${p.name} | ${domain} | ${p.format} | ${p.access.join('/')} | ${p.description ?? ''} | \`${eid}\` |`
                );
            }
        }
        const evts = services.flatMap((s) => s.events.map((e) => ({ s, e })));
        if (evts.length) {
            out.push(`\n### 事件\n`);
            for (const { s, e } of evts) {
                const eid = genEntityId('event', d.model, d.did, e.name, 'e', s.iid, e.iid);
                out.push(`- siid=${s.iid} eiid=${e.iid} ${e.name} (${e.description ?? ''}): \`${eid}\``);
            }
        }
        const acts = services.flatMap((s) => s.actions.map((a) => ({ s, a })));
        if (acts.length) {
            out.push(`\n### 动作\n`);
            for (const { s, a } of acts) {
                const eid = genEntityId('action', d.model, d.did, a.name, 'a', s.iid, a.iid);
                out.push(`- siid=${s.iid} aiid=${a.iid} ${a.name}: \`${eid}\``);
            }
        }
        out.push(`\n### @Device 模板\n`);
        out.push('```typescript');
        out.push(buildTemplate(d, services).trimEnd());
        out.push('```\n');
    }

    const md = out.join('\n');
    writeFileSync(join(process.cwd(), 'mi-devices-discovered.md'), md);
    console.log(`\n已写入 ./mi-devices-discovered.md`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

