import { createDevice } from '../actions/create-device.js';
import { MiMesh2Light } from './devices-def/mi-light.js';

export const diningRoom = {
    pendant: createDevice(MiMesh2Light, 'light.lemesh_cn_792874245_wy0d02_s_2')
};
