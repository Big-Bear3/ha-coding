const configPathExternal = '../../../../config.js';
const configPathInternal = '../../config.js';
let configModule: any;

try {
    configModule = await import(configPathExternal);
} catch (error) {
    configModule = await import(configPathInternal);
}

const config = configModule.default;

export const IP_ADDRESS_PORT: string = config.IP_ADDRESS_PORT;

export const HA_USER_NAME: string = config.HA_USER_NAME;

export const HA_PASSWORD: string = config.HA_PASSWORD;

export const IMMEDIATE_CALL: boolean = config.IMMEDIATE_CALL ?? false;

export const HA_WEBSOCKET_ADDRESS = `ws://${IP_ADDRESS_PORT}/api/websocket`;

export const HOLIDAYS = [
    '2025-01-01', // 元旦

    '2025-01-28', // 春节
    '2025-01-29',
    '2025-01-30',
    '2025-01-31',
    '2025-02-01',
    '2025-02-02',
    '2025-02-03',

    '2025-04-04', // 清明节
    '2025-04-05',
    '2025-04-06',

    '2025-05-01', // 劳动节
    '2025-05-02',
    '2025-05-03',
    '2025-05-04',
    '2025-05-05',

    '2025-05-31', // 端午节
    '2025-06-01',
    '2025-06-02',

    '2025-10-01', // 国庆节&中秋节
    '2025-10-02',
    '2025-10-03',
    '2025-10-04',
    '2025-10-05',
    '2025-10-06',
    '2025-10-07',
    '2025-10-08'
];

export const EXTRA_WORK_DAYS = ['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11'];

/** 地理位置 [纬度, 经度, 海拔] */
export const GEOGRAPHIC_LOCATION = [39.54, 116.25, 43];
