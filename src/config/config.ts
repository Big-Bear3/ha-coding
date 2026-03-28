import { pathToFileURL } from 'url';
import { join } from 'path';

const configPath = pathToFileURL(join(process.cwd(), 'config.js')).href;
const configModule: any = await import(configPath);

const config = configModule.default;

export const IP_ADDRESS_PORT: string = config.IP_ADDRESS_PORT;

export const HA_USER_NAME: string = config.HA_USER_NAME;

export const HA_PASSWORD: string = config.HA_PASSWORD;

export const IMMEDIATE_CALL: boolean = config.IMMEDIATE_CALL ?? false;

export const HA_WEBSOCKET_ADDRESS = `ws://${IP_ADDRESS_PORT}/api/websocket`;

export const HOLIDAYS = [
    '2026-01-01', // 元旦
    '2026-01-02',
    '2026-01-03',

    '2026-02-15', // 春节
    '2026-02-16',
    '2026-02-17',
    '2026-02-18',
    '2026-02-19',
    '2026-02-20',
    '2026-02-21',
    '2026-02-22',
    '2026-02-23',

    '2026-04-04', // 清明节
    '2026-04-05',
    '2026-04-06',

    '2026-05-01', // 劳动节
    '2026-05-02',
    '2026-05-03',
    '2026-05-04',
    '2026-05-05',

    '2026-06-19', // 端午节
    '2026-06-20',
    '2026-06-21',

    '2026-09-25', // 中秋节
    '2026-09-26',
    '2026-09-27',

    '2026-10-01', // 国庆节
    '2026-10-02',
    '2026-10-03',
    '2026-10-04',
    '2026-10-05',
    '2026-10-06',
    '2026-10-07'
];

export const EXTRA_WORK_DAYS = ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'];

/** 地理位置 [纬度, 经度, 海拔] */
export const GEOGRAPHIC_LOCATION = [39.54, 116.25, 43];
