import type { HAEvent } from '../../types/ha-types';
import type { DeviceDef } from '../../types/types';
import { Device } from '../../decorators/device.js';
import { State } from '../../decorators/state.js';

type MiMesh2LightEvent = HAEvent<{ brightness: number; color_temp_kelvin: number }, 'on' | 'off'>;

@Device()
export class MiMesh2Light implements DeviceDef {
    @State(function (value: MiMesh2Light['status']) {
        return { service: value === 1 ? 'turn_on' : 'turn_off' };
    })
    status: 0 | 1;

    @State(function (value: MiMesh2Light['status']) {
        return {
            service: 'turn_on',
            serviceData: {
                brightness_pct: value
            }
        };
    })
    brightness: number;

    @State(function (value: MiMesh2Light['status']) {
        return {
            service: 'turn_on',
            serviceData: {
                color_temp_kelvin: value
            }
        };
    })
    colorTemperature: number;

    $onEvent({ a, s }: MiMesh2LightEvent): void {
        if (s === 'on') {
            this.status = 1;
        } else if (s === 'off') {
            this.status = 0;
        }

        if (a.brightness !== undefined && a.brightness !== null) {
            this.brightness = Math.round((a.brightness * 100) / 255);
        }

        if (a.color_temp_kelvin !== undefined && a.color_temp_kelvin !== null) {
            this.colorTemperature = a.color_temp_kelvin;
        }
    }
}
