import { MiDeviceList } from './mi-device-list.js';
import type { EntityIdParseResult } from './mi-types.js';

/**
 * 解析 HA 小米集成的 entity_id，提取 did + siid + piid/eiid/aiid。
 *
 * entity_id 模板：{platform}.{model0[:9]}_{did_tag}_{modelN[:20]}[_{spec_name}]_{type}_{siid}_{id}
 * did_tag = slugify('{cloud_server}_{did}')，cn 区为 cn_{did}
 */
export function parseEntityId(entityId: string): EntityIdParseResult {
    const dotIdx = entityId.indexOf('.');
    const domain = dotIdx >= 0 ? entityId.substring(0, dotIdx) : '';
    const objectId = dotIdx >= 0 ? entityId.substring(dotIdx + 1) : entityId;

    let type: EntityIdParseResult['type'] = 'device';
    let siid: number;
    let piid: number;
    let eiid: number;
    let aiid: number;
    let body = objectId;

    // 尾部寻址：_p_X_Y / _e_X_Y / _a_X_Y / _s_X[_desc]
    const propMatch = objectId.match(/_p_(\d+)_(\d+)$/);
    const eventMatch = objectId.match(/_e_(\d+)_(\d+)$/);
    const actionMatch = objectId.match(/_a_(\d+)_(\d+)$/);
    // _s_{siid} 后的描述可能为空（中文 description slugify 后为空，ha_xiaomi_home 省略描述）
    const serviceMatch = objectId.match(/_s_(\d+)(?:_.+)?$/);

    if (propMatch) {
        type = 'prop';
        siid = parseInt(propMatch[1], 10);
        piid = parseInt(propMatch[2], 10);
        body = objectId.substring(0, propMatch.index);
    } else if (eventMatch) {
        type = 'event';
        siid = parseInt(eventMatch[1], 10);
        eiid = parseInt(eventMatch[2], 10);
        body = objectId.substring(0, eventMatch.index);
    } else if (actionMatch) {
        type = 'action';
        siid = parseInt(actionMatch[1], 10);
        aiid = parseInt(actionMatch[2], 10);
        body = objectId.substring(0, actionMatch.index);
    } else if (serviceMatch) {
        type = 'service';
        siid = parseInt(serviceMatch[1], 10);
        body = objectId.substring(0, serviceMatch.index);
    }

    const did = resolveDid(body);
    if (!did) return null;

    return { did, siid, piid, eiid, aiid, type, domain };
}

/** 解析 did：设备列表匹配优先（覆盖 BLE），正则兜底 */
function resolveDid(body: string): string {
    // 1. 设备列表匹配（最稳，覆盖含点号的 BLE did）
    const matched = MiDeviceList.instance.matchDid(body);
    if (matched) return matched;

    // 2. 群组 did
    const groupMatch = body.match(/cn_group_(\d+)/);
    if (groupMatch) return `group.${groupMatch[1]}`;

    // 3. 纯数字 did
    const numMatch = body.match(/cn_(\d+)/);
    if (numMatch) return numMatch[1];

    return null;
}

