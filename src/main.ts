// @peculiar/x509 依赖 tsyringe，运行时需要 reflect-metadata polyfill
import 'reflect-metadata';

import { Device } from './decorators/device.js';
import { State } from './decorators/state.js';
import { Action } from './decorators/action.js';
import { onChange } from './actions/on-change.js';
import { onDetect } from './actions/on-detect.js';
import { onKeep } from './actions/on-keep.js';
import { onSwitch } from './actions/on-switch.js';
import { stage, step } from './actions/stage.js';
import { Timer } from './actions/timer.js';
import { delay } from './actions/delay.js';
import { schedule } from './actions/schedule.js';
import { ref } from './objects/ref.js';
import {
    cloneDeep,
    isEqual,
    isWeekday,
    isWeekend,
    isWorkDay,
    isNotWorkDay,
    getSunInfo,
    getSunriseTime,
    getSunsetTime,
    inTimeRange
} from './utils/app-utils.js';
import { initHACoding } from './services/app-service.js';
import { createDevice, createExternalDevice } from './actions/create-device.js';
import { onStartup } from './actions/life-cycle.js';
import { CallInfo, CallService } from './services/call-service.js';
import { sendNotification } from './actions/send-notification.js';
import { HAWebsocketService } from './services/ha-websocket-service.js';
import { customSubscribe, removeCustomSubscribe } from './actions/custom-subscribe.js';
import type { ObjectType } from './types/types';
import { GEOGRAPHIC_LOCATION } from './config/config.js';
import { DeviceManager } from './managers/device-manager.js';
import { logger } from './services/logger-service.js';
import { MiCertManager } from './services/mi/mi-cert-manager.js';
import { MI_OAUTH_REDIRECT_URL } from './config/config.js';

const call = (callInfo: CallInfo) => CallService.instance.push(callInfo);

const sendMessage = (msg: string | ObjectType) => HAWebsocketService.instance.send(msg);

const getGeographicLocation = () => GEOGRAPHIC_LOCATION;

const isUnavailableEntity = (entityId: string) => DeviceManager.instance.isUnavailableEntity(entityId);

const getUnavailableEntities = () => DeviceManager.instance.getUnavailableEntities();

const getBelongingDevice = (entityId: string) => DeviceManager.instance.getDevice(entityId);

/** 小米中枢网关 OAuth 登录（首次使用直连前调用一次） */
const miLogin = (): Promise<void> => MiCertManager.instance.login(MI_OAUTH_REDIRECT_URL);

export {
    Device,
    State,
    Action,
    onChange,
    onDetect,
    onKeep,
    onSwitch,
    stage,
    step,
    Timer,
    delay,
    schedule,
    ref,
    cloneDeep,
    isEqual,
    isWeekday,
    isWeekend,
    isWorkDay,
    isNotWorkDay,
    getSunInfo,
    getSunriseTime,
    getSunsetTime,
    inTimeRange,
    initHACoding,
    createDevice,
    createExternalDevice,
    onStartup,
    call,
    sendNotification,
    customSubscribe,
    removeCustomSubscribe,
    sendMessage,
    getGeographicLocation,
    isUnavailableEntity,
    getUnavailableEntities,
    getBelongingDevice,
    logger,
    miLogin
};

