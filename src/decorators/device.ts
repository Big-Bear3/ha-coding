import type { Class } from '../types/types';
import { StateManager } from '../managers/state-manager.js';
import { DeviceManager } from '../managers/device-manager.js';
import { HA_ENABLED } from '../config/config.js';

export interface DeviceOptions {
    /** 是否直连小米中枢网关（不走 Home Assistant）。HA 未启用时默认 true（无 HA 可走） */
    miGatewayDirect?: boolean;
}

export function Device(options?: DeviceOptions): ClassDecorator {
    return function (c: Class) {
        // HA 未启用时所有设备默认走小米直连；HA 启用时需显式 miGatewayDirect: true
        if (options?.miGatewayDirect || !HA_ENABLED) DeviceManager.instance.registerMiGatewayDirectDeviceDef(c);

        StateManager.instance.handleActionDefine(c.prototype);
    } as ClassDecorator;
}

