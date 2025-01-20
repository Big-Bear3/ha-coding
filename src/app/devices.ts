import { createDevice } from '../../index.js';
import { MiLight } from './devices-def/mi-light.js';
import { MiTrio } from './devices-def/mi-trio.js';

/** 餐厅设备 */
export const diningRoom = {
    pendant: createDevice(MiLight, { light: 'light.lemesh_cn_792874245_wy0d02_s_2' })
};

/** 卫生间设备 */
export const gBathroom = {};

/** 主卫设备 */
export const mBathroom = {
    occupySensor: createDevice(MiTrio, {
        allArea: 'sensor.izq_cn_681606775_trio_occupancy_status_p_2_1',
        illumination: 'sensor.izq_cn_681606775_trio_illumination_p_2_2',
        area1: 'sensor.izq_cn_681606775_trio_status_p_6_1',
        area2: 'sensor.izq_cn_681606775_trio_status_p_6_2'
    })
};
