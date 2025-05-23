import { Device } from './decorators/device.js';
import { State } from './decorators/state.js';
import { Action } from './decorators/action.js';
import { onChange } from './actions/on-change.js';
import { onDetect } from './actions/on-detect.js';
import { onKeep } from './actions/on-keep.js';
import { stage, step } from './actions/stage.js';
import { Timer } from './actions/timer.js';
import { delay } from './actions/delay.js';
import { schedule } from './actions/schedule.js';
import { ref } from './objects/ref.js';
import {
    cloneDeep,
    isEqual,
    isWeekDay,
    isWeekend,
    isWorkDay,
    isNotWorkDay,
    getSunInfo,
    getSunriseTime,
    getSunsetTime,
    inTimeRange
} from './utils/app-utils.js';
import { initHACoding } from './services/app-service.js';
import { createDevice } from './actions/create-device.js';
import { onStartup } from './actions/life-cycle.js';
import { CallInfo, CallService } from './services/call-service.js';
import { sendNotification } from './actions/send-notification.js';
import { HAWebsocketService } from './services/ha-websocket-service.js';
import { customSubscribe, removeCustomSubscribe } from './actions/custom-subscribe.js';
import type { ObjectType } from './types/types';
import { GEOGRAPHIC_LOCATION } from './config/config.js';
import { DeviceManager } from './managers/device-manager.js';

const call = (callInfo: CallInfo) => CallService.instance.push(callInfo);

const sendMsg = (msg: string | ObjectType) => HAWebsocketService.instance.send(msg);

const getGeographicLocation = () => GEOGRAPHIC_LOCATION;

const isUnavailableEntity = (entityId: string) => DeviceManager.instance.isUnavailableEntity(entityId);

const getUnavailableEntities = () => DeviceManager.instance.getUnavailableEntities();

const getBelongingDevice = (entityId: string) => DeviceManager.instance.getDevice(entityId);

export {
    Device,
    State,
    Action,
    onChange,
    onDetect,
    onKeep,
    stage,
    step,
    Timer,
    delay,
    schedule,
    ref,
    cloneDeep,
    isEqual,
    isWeekDay,
    isWeekend,
    isWorkDay,
    isNotWorkDay,
    getSunInfo,
    getSunriseTime,
    getSunsetTime,
    inTimeRange,
    initHACoding,
    createDevice,
    onStartup,
    call,
    sendNotification,
    customSubscribe,
    removeCustomSubscribe,
    sendMsg,
    getGeographicLocation,
    isUnavailableEntity,
    getUnavailableEntities,
    getBelongingDevice
};
