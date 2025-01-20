import type { HAEvent } from '../../types/ha-types';
import type { DeviceDef } from '../../types/types';
import { Device, State } from '../../../index.js';

type MiLightEvent = HAEvent<{ brightness: number; color_temp_kelvin: number }, 'on' | 'off'>;

@Device()
export class MiLight implements DeviceDef {
    $entityIds: { light: string };

    @State(function (this: MiLight, value: MiLight['on']) {
        return { service: value ? 'turn_on' : 'turn_off', entityId: this.$entityIds.light };
    })
    on: boolean;

    @State(function (this: MiLight, value: MiLight['on']) {
        return {
            service: 'turn_on',
            serviceData: {
                brightness_pct: value
            },
            entityId: this.$entityIds.light
        };
    })
    brightness: number;

    @State(function (this: MiLight, value: MiLight['on']) {
        return {
            service: 'turn_on',
            serviceData: {
                color_temp_kelvin: value
            },
            entityId: this.$entityIds.light
        };
    })
    colorTemperature: number;

    $onEvent({ a, s }: MiLightEvent, entityId: string): void {
        if (entityId !== this.$entityIds.light) return;

        if (s === 'on') {
            this.on = true;
        } else if (s === 'off') {
            this.on = false;
        }

        if (a.brightness !== undefined && a.brightness !== null) {
            this.brightness = Math.round((a.brightness * 100) / 255);
        }

        if (a.color_temp_kelvin !== undefined && a.color_temp_kelvin !== null) {
            this.colorTemperature = a.color_temp_kelvin;
        }
    }
}
