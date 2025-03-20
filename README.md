## 面向Home Assistant，使用TypeScript编写全平台自动化！更自由，更灵活！
# 用法风格概览
```ts
// 监听卫生间人在传感器有人无人变化
onChange(
    () => bathroom.occupySensor.occupied, // 有人无人状态
    (occupied) => {
        if (occupied) {
            // 如果有人则开灯
            bathroom.lamp.on = true;
        } else {
            // 如果无人则关灯
            bathroom.lamp.on = false;
        }
    }
);
```
# 快速上手
**前提：**
1. 已经安装好 [Home Assistant](https://www.home-assistant.io/) 以及相关集成。
2. 已经安装好 [Nodejs](https://nodejs.org/zh-cn) 环境。
3. 已经安装好 [VS Code](https://code.visualstudio.com/) 开发工具。

**下载项目模版：**
[下载页面](https://github.com/Big-Bear3/ha-coding/blob/main/my-home.zip)  （进入页面后点击下载按钮下载）

**安装：**
解压项目模板文件并在终端中打开，执行以下命令：
```bash
cd my-home
npm install
npm install ha-coding
```
**配置项目：**
用VS Code打开项目，打开根目录下的 config.js 文件，并配置成你的 Home Assistant 的相关配置
```ts
export default {
    /** HomeAssistant后台ip地址:端口号，如：192.168.31.156:8123 */
    IP_ADDRESS_PORT: '',
    /** HomeAssistant用户名 */
    HA_USER_NAME: '',
    /** HomeAssistant密码 */
    HA_PASSWORD: ''
};
```
**启动项目：**
在终端中执行以下命令：
```bash
npm start
```
等待几秒后控制台打印 “HA Coding 启动成功！”，则证明启动成功。如果控制台报错，则为启动失败。
# 使用说明
## 定义设备
<br>定义设备是为了告知系统每个设备是如何与 Home Assistant 交互的，推荐在项目的 devices-def 文件夹下定义
```ts
@Device()
export class MiLight implements DeviceDef {
    $entityIds: { light: string };

    @State(function (this: MiLight, value: MiLight['on']) {
        return { service: value ? 'turn_on' : 'turn_off', entityId: this.$entityIds.light };
    })
    on: boolean;

    @State(function (this: MiLight, value: MiLight['brightness']) {
        return {
            service: 'turn_on',
            serviceData: {
                brightness_pct: value
            },
            entityId: this.$entityIds.light
        };
    })
    brightness: number;

    @State(function (this: MiLight, value: MiLight['colorTemperature']) {
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
```
如上定义了一个米家智能灯设备：
1. 创建一个 MiLight 类并实现 DeviceDef 接口，并使用 @Device() 装饰器装饰 MiLight 类。
2. 创建 $entityIds 成员变量，用于存放该设备下的所有实体id。
3. 定义设备的属性 on（开关状态）、brightness（亮度）、colorTemperature（色温），并使用 @State() 装饰器装饰。@State() 装饰器中的参数回调方法返回发送信息来告知系统当该属性发生变化时，如何发送到Home Assistant上。
4. 定义 $onEvent 方法，当 Home Assistant 产生事件时会调用该方法，将事件信息映射到设备的属性上。

事件信息和发送信息可以在 Home Assistant 网页上使用 F12 查看 WebSocket 记录查询到。

<a id="createDevice"></a>
## 创建设备实例
<br>在定义好设备后，我们需要创建这些设备的实例，以便在后续为这些设备编写自动化，推荐在项目的devices文件夹下创建
```ts
export const bathroom = {
    lamp: createDevice(MiLight, { light: 'your entity id' }),
    occupySensor: createDevice(MiTrio, {
        allArea: 'your entity id',
        illumination: 'your entity id',
        area1: 'your entity id',
        area2: 'your entity id'
    })
};
```
如上使用 createDevice() 方法定义了卫生间的一个米家智能灯设备和一个Trio人在传感器设备，createDevice() 方法的第一个参数为设备的定义类，第二个参数为该设备下的所有实体id。

## 编写自动化
<br>在创建好设备后，我们就可以为这些设备编写自动化了，推荐在项目的automation文件夹下创建
```ts
// 监听卫生间人在传感器区域1有人无人变化
onChange(
    () => bathroom.occupySensor.area1Occupied, // 区域1有人无人状态
    (area1Occupied) => {
        if (area1Occupied) {
            // 如果有人则开灯
            bathroom.lamp.on = true;
        } else {
            // 如果无人则关灯
            bathroom.lamp.on = false;
        }
    }
);
```
如上使用onChange()方法，监听区域1有人无人状态，如果区域1有人则开灯，无人则关灯。更多的使用说明可以在下面的 API 中查询。

# API
## onChange()
```ts
function onChange<T>(
    statesGetter: () => T,
    cb: (states: CbStates<T>, oldStates: CbStates<T>) => void,
    onChangeOptions?: {
        immediate?: boolean;
    }
): {
    pause: () => void;
    resume: () => void;
};
```
onChange() 方法用于监听设备的状态变化，执行相关的逻辑。

参数：
- statesGetter - 用于指定需要监听的设备状态，可以同时监听多个设备的多个状态。
- cb - 状态变化后调用的回调方法。
- onChangeOptions - 指定 onChange() 方法的监听选项，immediate - 是否在调用 onChange() 方法后，立即执行一次回调方法。

返回值：
- pause - 调用该方法以暂停监听
- resume - 调用该方法以恢复监听

## onKeep()
```ts
function onKeep(
    statesJudger: () => boolean,
    cb: () => void,
    keepTime?: number,
    lifeCycle?: { onMatch?: () => void; onBreak?: () => void }
): {
    stop: () => void;
    resume: () => void;
    miss: () => void;
    hit: () => void;
};
```
onKeep() 方法用于在设备状态维持了一段时间后，执行相关逻辑。

参数：
- statesJudger - 状态是否符合预期。
- cb - 状态符合预期并维持了指定时长后的回调方法。
- keepTime - 指定设备状态维持的时长。
- lifeCycle - 生命周期：onMatch - 每次符合条件时的回调函数。 onBreak - 每次不符合条件时的回调函数。

返回值：
- stop - 调用该方法以停止监听，并将维持时间清零
- resume - 调用该方法以恢复监听
- miss - 调用该方法以舍弃本次状态符合预期的延时任务
- hit - 调用该方法以舍弃本次状态符合预期的延时任务，并直接调用回调方法

## stage()
```ts
function stage<T extends [ReturnType<typeof step<any>>, ReturnType<typeof step<any>>, ...ReturnType<typeof step<any>>[]]>(
    ...steps: T
): {
    next: (waitingTime?: number) => void;
    prev: (waitingTime?: number) => void;
    goto: (stepIndex: ArrayIndexes<T>) => void;
    reset: () => void;
    pause: () => void;
    resume: () => void;
}
```
stage() 方法用于在事件或状态先后发生后，执行相关逻辑。

参数：
- steps - 事件的阶段

返回值：
- next - 进入下一个阶段。 waitingTime - 下一个阶段等待的时长（单位：毫秒），超时则重置到第一个阶段。
- prev - 进入上一个阶段。 waitingTime - 上一个阶段等待的时长（单位：毫秒），超时则重置到第一个阶段。
- goto - 进入指定阶段。 waitingTime - 指定阶段等待的时长（单位：毫秒），超时则重置到第一个阶段。
- reset - 重置到第一个阶段。
- pause - 暂停当前阶段的监听。
- resume - 恢复当前阶段的监听。

## Timer
```ts
class Timer {
    constructor();
    timing: (cb: () => void, time: number) => () => void;
    cancel: () => void;
}
```
Timer类用于延时执行某段逻辑，需要实例化后使用。

方法: 
- timing() - 延时执行某段逻辑，再次调用会取消上一次的延时执行逻辑。 cb - 要执行逻辑的回调方法。 time - 延时的时间（单位：毫秒）。 返回值 - 取消延时执行这段逻辑。
- cancel() - 取消延时执行某段逻辑。

## delay()
```ts
function delay(cb: () => void, time: number): () => void;
```
delay() 方法用于延时执行某段逻辑，与 Timer 不同的是，再次调用不会取消上一次的延时执行逻辑。

参数：
- cb - 要执行逻辑的回调方法。
- time - 延时的时间（单位：毫秒）。

## schedule()
```ts
function schedule(
    time: TimeStr | number | ((date: DateStr, week: number) => TimeStr | number),
    cb: () => void,
    repeatType: RepeatType
);
```
schedule() 方法用于在当天定时执行某段逻辑。

参数：
- time - 定时的时间。分两种，一种字符串，如："16:21:00"，一种是距当天0点的毫秒数，也可以通过回调方法返回这两种，回调方法参数 date - 当天的日期，week - 当天是周几（0是周日，1是周一，2是周二 ...以此类推）。
- cb - 到设定的定时时间的回调方法。
- repeatType - 重复类型，可选的值如下：
```ts
export type RepeatType =
    | 'EVERY_DAY'  // 每天（默认）
    | 'WEEK_DAY' // 周一到周五
    | 'WEEKEND' // 周六日
    | 'WORK_DAY' // 工作日（算上调休日）
    | 'NON_WORK_DAY' // 周六日和法定节假日
    | WEEK[] // 指定星期几
    | ((date: DateStr, week: number) => boolean); // 返回值为真则当日执行，为假当日不执行。 date - 当天的日期，week - 当天是周几（0是周日，1是周一，2是周二 ...以此类推）。
```

## onDetect()
```ts
function onDetect<T>(
    statesGetter: () => T,
    cb: (states: CbStates<T>, historyStates: CbStates<T>[]) => void,
    periodTime: number
): {
    pause: () => void;
    resume: () => void;
    reset: () => void;
};
```
onDetect() 方法用于记录一段时间内的状态，供用户判断，并执行相关逻辑。如：温度在3小时内变化超过5度，执行某段逻辑。

参数：
- statesGetter - 用于指定需要监听的设备状态，可以同时监听多个设备的多个状态。
- cb - 状态变化后调用的回调方法。
- periodTime - 指定时间段。

返回值：
- pause - 调用该方法以暂停监听
- resume - 调用该方法以恢复监听
- reset - 重置（清除历史状态）

## @Device()
```ts
function Device(): ClassDecorator;
```
@Device() 装饰器用于装饰设备定义类，设备定义类被其装饰才会有本篇说明的一系列效果。

## @State()
```ts
function State(): PropertyDecorator;
function State(callInfoGetter: CallInfoGetter): PropertyDecorator;
function State(stateOptions: StateOptions): PropertyDecorator;
function State(callInfoGetter: CallInfoGetter, stateOptions: StateOptions): PropertyDecorator;
```
@State() 装饰器装饰的变量会变为响应式变量，可以被 onChange()、onKeep() 等方法监听。
参数：
- callInfoGetter - 返回CallInfo对象，告知系统如何向 HA 发送报文以更新设备状态。
- stateOptions - 目前内部仅有一个属性 persistentKeyGetter，该属性是方法类型，如果你需要持久化这个 state 成员变量，可以设置该方法，并返回一个唯一的key，每次值变化时，系统将用这个 key 作为键将其持久化 (保存到磁盘上)。下次系统启动时，系统会根据这个 key，取回持久化的值赋值给该成员变量。取回的值的优先级大于为其赋的初始值。

## @Action()
```ts
function Action(): MethodDecorator;
```
@Action() 装饰器用于装饰设备的无状态事件（如：无线开关的单击事件）的方法，该方法被调用时，可以被 onChange()、onKeep() 等方法监听到。

## ref()
```ts
function ref<T>(value?: T): Ref<T>;
```
ref() 方法用于创建响应式变量，与被State()装饰器装饰的变量一样，同样可以被 onChange()、onKeep() 等方法监听。

参数：
- value - 变量的初始值。

返回值：
创建的响应式变量。该变量有3个属性：
- value - 响应式变量的值。
- trigger - 调用 trigger 方法以立即触发监听该 ref 对象的所有回调方法。
- asPersistent - 调用此方法可以将这个 ref 对象的值进行持久化（保存到磁盘上），该方法需要向其传递一个 key，并保证其唯一性，每次这个 ref 对象的值变化时，系统将用这个 key 作为键存储这个值。下次系统启动时，系统会根据这个 key，取回持久化的值赋值给 ref 对象 (ref.value)。取回的值的优先级大于传入 ref 方法的参数值，如：const r = ref(123).asPersistent('my_key'); r.value = 456; 下次进入系统时，r.value 的值为 456。

## createDevice()
```ts
createDevice<T extends Class<DeviceDef>>(
    deviceDef: T,
    entityIds: InstanceType<T>['$entityIds'],
    ...cps: ConstructorParameters<T>
): InstanceType<T>;
```
createDevice() 方法用于创建设备的实例。具体用法可以参考[创建设备实例章节](#createDevice)。

## onStartup()
```ts
export function onStartup(cb: () => void): void;
```
onStartup() 方法用于在 HA Coding 启动时添加一个回调函数，HA Coding 启动时会调用这个函数。

## call()
```ts
call(callInfo: CallInfo): void;
```
call() 方法用于下发要对某一设备执行的操作。

## sendNotification()
```ts
sendNotification(notificationInfo: NotificationInfo): void;
```
sendNotification() 方法用于为某一设备实体发送通知。

## customSubscribe()
```ts
customSubscribe(cb: (msgData: ObjectType) => boolean): number
```
customSubscribe() 方法用于自定义订阅Home assistant Websocket返回的消息。

## removeCustomSubscribe()
```ts
removeCustomSubscribe(customSubscribeId: number): void;
```
removeCustomSubscribe() 方法用于移除自定义订阅。

## sendMsg()
```ts
sendMsg(msg: string | ObjectType): void;
```
sendMsg() 方法用于向Home assistant Websocket发送自定义消息。

## 其他
```ts
/** 深拷贝一个对象 */
export function cloneDeep<T>(value: T): T;

/** 判断两个对象中的属性是否全部相等 */
export function isEqual(value: any, other: any): boolean;

/** 判断是否是周一到周五 */
export function isWeekDay(date?: DateStr): boolean;

/** 判断是否是周六日 */
export function isWeekend(date?: DateStr): boolean;

/** 判断是否是工作日（算上调休日） */
export function isWorkDay(date?: DateStr): boolean;

/** 判断是否是周六日或法定节假日 */
export function isNotWorkDay(date?: DateStr): boolean;

/** 获取太阳相关信息 */
export function getSunInfo(date?: DateStr): SunInfo;

/** 获取日出时间 */
export function getSunriseTime(date?: DateStr): TimeStr;

/** 获取日落时间 */
export function getSunsetTime(date?: DateStr): TimeStr;

/** 判断是否在某一时间范围内 */
export function inTimeRange(startTime: TimeStr, endTime: TimeStr): boolean;

/** 获取在 HA 中设置的地理位置 [纬度, 经度, 海拔] */
export function getGeographicLocation(): [number, number, number];
```
