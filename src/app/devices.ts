import { createDevice } from '../actions/create-device.js';
import { MiMesh2Light } from './devices-def/mi-light.js';

/** 餐厅设备 */
export const diningRoom = {
    pendant: createDevice(MiMesh2Light, 'light.lemesh_cn_792874245_wy0d02_s_2')
};

/** 卫生间设备 */
export const gBathroom = {};

/** 主卫设备 */
export const mBathroom = {};
