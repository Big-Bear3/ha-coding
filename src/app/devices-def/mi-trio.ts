import type { HAEvent } from '../../types/ha-types';
import type { DeviceDef } from '../../types/types';
import { Device, State } from '../../../index.js';

type MiTrioEvent = HAEvent<{}, string>;

@Device()
export class MiTrio implements DeviceDef {
    $entityIds: {
        allArea: string;
        illumination: string;
        area1: string;
        area2: string;
    };

    /** 区域1是否有人 */
    @State()
    area1Occupied: boolean;

    /** 区域2是否有人 */
    @State()
    area2Occupied: boolean;

    /** 光照度 */
    @State()
    illumination: number;

    $onEvent({ a, s }: MiTrioEvent, entityId: string): void {
        switch (entityId) {
            case this.$entityIds.illumination:
                this.illumination = Number(s);
                break;

            case this.$entityIds.area1:
                if (s === '有人') {
                    this.area1Occupied = true;
                } else {
                    this.area1Occupied = false;
                }
                break;

            case this.$entityIds.area2:
                if (s === '有人') {
                    this.area2Occupied = true;
                } else {
                    this.area2Occupied = false;
                }
                break;
        }
    }
}
